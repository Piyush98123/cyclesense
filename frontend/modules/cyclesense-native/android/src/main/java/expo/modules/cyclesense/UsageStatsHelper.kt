package expo.modules.cyclesense

import android.app.AppOpsManager
import android.app.usage.NetworkStats
import android.app.usage.NetworkStatsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.os.Build
import android.os.Process
import android.provider.Settings
import org.json.JSONArray
import org.json.JSONObject

/**
 * UsageStats is a *special* permission (PACKAGE_USAGE_STATS). By product
 * policy this stays OFF by default - the module never queries stats unless
 * the user explicitly toggles it on in Settings and grants access from the
 * system Settings > Usage access page.
 */
internal object UsageStatsHelper {

  fun hasPermission(context: Context): Boolean {
    val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as? AppOpsManager ?: return false
    val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      appOps.unsafeCheckOpNoThrow(
        AppOpsManager.OPSTR_GET_USAGE_STATS,
        Process.myUid(),
        context.packageName
      )
    } else {
      @Suppress("DEPRECATION")
      appOps.checkOpNoThrow(
        AppOpsManager.OPSTR_GET_USAGE_STATS,
        Process.myUid(),
        context.packageName
      )
    }
    return mode == AppOpsManager.MODE_ALLOWED
  }

  fun openSettings(context: Context) {
    val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    context.applicationContext.startActivity(intent)
  }

  fun query(context: Context, dayCount: Int): JSONArray {
    val out = JSONArray()
    if (!hasPermission(context)) return out
    val manager = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager ?: return out
    val end = System.currentTimeMillis()
    val start = end - dayCount.coerceAtLeast(1).toLong() * 24L * 60L * 60L * 1000L
    val stats = manager.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, start, end) ?: return out
    val pm = context.packageManager
    for (entry in stats) {
      if (entry.totalTimeInForeground <= 0L) continue
      val row = JSONObject()
      row.put("packageName", entry.packageName)
      row.put("label", resolveLabel(pm, entry.packageName))
      row.put("totalTimeForegroundMs", entry.totalTimeInForeground)
      row.put("firstTimeStampMs", entry.firstTimeStamp)
      row.put("lastTimeStampMs", entry.lastTimeStamp)
      row.put("lastTimeUsedMs", entry.lastTimeUsed)
      out.put(row)
    }
    return out
  }

  /**
   * Uses UsageStatsManager.queryEvents to compute exact per-package foreground
   * time inside an arbitrary window - the only reliable way to get session-scoped
   * usage data. Returns a list ordered by foreground time desc with friendly
   * app labels resolved via PackageManager.
   */
  fun queryForegroundTime(context: Context, startMs: Long, endMs: Long): JSONArray {
    val out = JSONArray()
    if (!hasPermission(context)) return out
    val manager = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager ?: return out
    val pm = context.packageManager
    val events = manager.queryEvents(startMs, endMs) ?: return out

    // Aggregate foreground time per package by walking MOVE_TO_FOREGROUND -> MOVE_TO_BACKGROUND pairs
    val startTimes = mutableMapOf<String, Long>()
    val totals = mutableMapOf<String, Long>()
    val event = UsageEvents.Event()
    while (events.hasNextEvent()) {
      events.getNextEvent(event)
      val pkg = event.packageName ?: continue
      when (event.eventType) {
        UsageEvents.Event.MOVE_TO_FOREGROUND, UsageEvents.Event.ACTIVITY_RESUMED -> {
          startTimes[pkg] = event.timeStamp
        }
        UsageEvents.Event.MOVE_TO_BACKGROUND, UsageEvents.Event.ACTIVITY_PAUSED -> {
          val startedAt = startTimes.remove(pkg) ?: continue
          val delta = event.timeStamp - startedAt
          if (delta > 0) totals[pkg] = (totals[pkg] ?: 0L) + delta
        }
      }
    }
    // Anything still open at window end counts up to endMs
    for ((pkg, startedAt) in startTimes) {
      val delta = endMs - startedAt
      if (delta > 0) totals[pkg] = (totals[pkg] ?: 0L) + delta
    }

    // Sort by foreground time desc and resolve labels
    val ordered = totals.entries.sortedByDescending { it.value }
    for ((pkg, ms) in ordered) {
      if (ms <= 0L) continue
      val row = JSONObject()
      row.put("packageName", pkg)
      row.put("foregroundMs", ms)
      row.put("label", resolveLabel(pm, pkg))
      out.put(row)
    }
    return out
  }

  /**
   * Per-app data usage (Wi-Fi + mobile combined, in bytes) for a session
   * window - the Phase 2 extension to "why did it drain" that the
   * requirements doc explicitly deferred as a later nice-to-have, separate
   * from the core screen-time correlation.
   *
   * This is a genuinely fussier corner of the Android API than
   * UsageStatsManager: NetworkStatsManager.querySummary needs a
   * subscriberId for mobile data specifically, and requiring
   * READ_PHONE_STATE just for that would be a disproportionate permission
   * ask for a secondary insight. Since API 29, passing an empty string
   * matches all mobile subscriptions without that permission - so mobile
   * data is attempted but never required; if it throws on a given
   * OEM/API level, this silently falls back to Wi-Fi-only rather than
   * failing the whole feature. Wi-Fi has no such restriction.
   */
  fun queryNetworkUsage(context: Context, startMs: Long, endMs: Long): JSONArray {
    val out = JSONArray()
    if (!hasPermission(context)) return out
    val manager = context.getSystemService(Context.NETWORK_STATS_SERVICE) as? NetworkStatsManager ?: return out
    val pm = context.packageManager

    val totalsByUid = mutableMapOf<Int, Long>()

    fun accumulate(networkType: Int, subscriberId: String?) {
      try {
        val stats = manager.querySummary(networkType, subscriberId, startMs, endMs) ?: return
        val bucket = NetworkStats.Bucket()
        while (stats.hasNextBucket()) {
          stats.getNextBucket(bucket)
          val uid = bucket.uid
          if (uid < 0) continue // system/removed-app buckets - nothing to attribute this to
          val bytes = bucket.rxBytes + bucket.txBytes
          if (bytes <= 0) continue
          totalsByUid[uid] = (totalsByUid[uid] ?: 0L) + bytes
        }
        stats.close()
      } catch (_: Throwable) {
        // Expected on some OEM/API combinations - degrade gracefully, never crash a discharge-session close over this.
      }
    }

    accumulate(ConnectivityManager.TYPE_WIFI, null)
    accumulate(ConnectivityManager.TYPE_MOBILE, "")

    val ordered = totalsByUid.entries.sortedByDescending { it.value }
    for ((uid, bytes) in ordered) {
      val packages = try { pm.getPackagesForUid(uid) } catch (_: Throwable) { null }
      val pkg = packages?.firstOrNull() ?: continue
      val row = JSONObject()
      row.put("packageName", pkg)
      row.put("label", resolveLabel(pm, pkg))
      row.put("totalBytes", bytes)
      out.put(row)
    }
    return out
  }

  private fun resolveLabel(pm: PackageManager, pkg: String): String {
    return try {
      val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        pm.getApplicationInfo(pkg, PackageManager.ApplicationInfoFlags.of(0))
      } else {
        @Suppress("DEPRECATION")
        pm.getApplicationInfo(pkg, 0)
      }
      pm.getApplicationLabel(info).toString()
    } catch (_: Throwable) {
      pkg
    }
  }
}