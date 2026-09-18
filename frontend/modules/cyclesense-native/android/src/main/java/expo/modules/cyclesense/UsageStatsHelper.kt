package expo.modules.cyclesense

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
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
    for (entry in stats) {
      if (entry.totalTimeInForeground <= 0L) continue
      val row = JSONObject()
      row.put("packageName", entry.packageName)
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
