package expo.modules.cyclesense

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import androidx.core.content.ContextCompat
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference
import java.util.concurrent.TimeUnit
import org.json.JSONArray
import org.json.JSONObject

private const val TELEMETRY_EVENT = "onTelemetryChange"
private const val SCREEN_EVENT = "onScreenChange"
private const val WORK_NAME = "cyclesense.battery.sampling"

/**
 * The single native entry-point for CycleSense. Exposes:
 *   - deep BatteryManager telemetry (level, temp, voltage, current, health)
 *   - WorkManager control for periodic on-device sampling
 *   - opt-in UsageStats helpers (permission stays OFF unless the user grants it)
 */
class CycleSenseNativeModule : Module() {

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private var telemetryReceiver: BroadcastReceiver? = null
  private var screenReceiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("CycleSenseNative")

    Constants(
      "platform" to "android",
      "isSupported" to true,
      "minIntervalMinutes" to 15
    )

    Events(TELEMETRY_EVENT, SCREEN_EVENT)

    OnCreate {
      registerTelemetryReceiver()
      registerScreenReceiver()
    }

    OnDestroy {
      unregisterTelemetryReceiver()
      unregisterScreenReceiver()
    }

    OnActivityEntersForeground {
      registerTelemetryReceiver()
      registerScreenReceiver()
    }

    OnActivityEntersBackground {
      unregisterTelemetryReceiver()
      //unregisterScreenReceiver()
    }

    AsyncFunction("getBatteryTelemetry") {
      return@AsyncFunction jsonToMap(BatteryTelemetry.snapshot(context))
    }

    AsyncFunction("startBackgroundSampling") { intervalMinutes: Int ->
      val interval = intervalMinutes.coerceAtLeast(15).toLong()
      val request = PeriodicWorkRequestBuilder<BatterySamplingWorker>(interval, TimeUnit.MINUTES)
        .addTag(WORK_NAME)
        .build()
      WorkManager.getInstance(context.applicationContext)
        .enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, request)
      return@AsyncFunction true
    }

    AsyncFunction("stopBackgroundSampling") {
      WorkManager.getInstance(context.applicationContext).cancelUniqueWork(WORK_NAME)
      return@AsyncFunction true
    }

    AsyncFunction("isBackgroundSamplingActive") {
      val infos = WorkManager.getInstance(context.applicationContext)
        .getWorkInfosForUniqueWork(WORK_NAME).get()
      return@AsyncFunction infos.any { !it.state.isFinished }
    }

    AsyncFunction("getSamples") { limit: Int ->
      return@AsyncFunction jsonToList(SampleStore.tail(context, limit))
    }

    AsyncFunction("clearSamples") {
      SampleStore.clear(context)
      return@AsyncFunction true
    }

    AsyncFunction("setDynamicIconState") { charging: Boolean ->
      setDynamicIcon(charging)
      return@AsyncFunction true
    }

    AsyncFunction("hasUsageStatsPermission") {
      return@AsyncFunction UsageStatsHelper.hasPermission(context)
    }

    AsyncFunction("openUsageStatsSettings") {
      UsageStatsHelper.openSettings(context)
      return@AsyncFunction true
    }

    AsyncFunction("getUsageStats") { dayCount: Int ->
      return@AsyncFunction jsonToList(UsageStatsHelper.query(context, dayCount))
    }

    AsyncFunction("getUsageEvents") { startMs: Double, endMs: Double ->
      return@AsyncFunction jsonToList(UsageStatsHelper.queryForegroundTime(context, startMs.toLong(), endMs.toLong()))
    }

    AsyncFunction("getNetworkUsage") { startMs: Double, endMs: Double ->
      return@AsyncFunction jsonToList(UsageStatsHelper.queryNetworkUsage(context, startMs.toLong(), endMs.toLong()))
    }

    AsyncFunction("startSessionForeground") { mode: String, startLevel: Int ->
      val intent = Intent(context.applicationContext, SessionForegroundService::class.java).apply {
        action = SessionForegroundService.ACTION_START
        putExtra(SessionForegroundService.EXTRA_MODE, mode)
        putExtra(SessionForegroundService.EXTRA_START_LEVEL, startLevel)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        ContextCompat.startForegroundService(context.applicationContext, intent)
      } else {
        context.applicationContext.startService(intent)
      }
      return@AsyncFunction true
    }

    AsyncFunction("stopSessionForeground") {
      val intent = Intent(context.applicationContext, SessionForegroundService::class.java).apply {
        action = SessionForegroundService.ACTION_STOP
      }
      try {
        context.applicationContext.startService(intent)
      } catch (_: Throwable) {
        // service already stopped
      }
      return@AsyncFunction true
    }

    AsyncFunction("isScreenOn") {
      val pm = context.applicationContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
      return@AsyncFunction pm?.isInteractive ?: true
    }

    AsyncFunction("setSoundCuesEnabled") { enabled: Boolean ->
      CycleSensePrefs.prefs(context).edit()
        .putBoolean(CycleSensePrefs.KEY_SOUND_CUES, enabled)
        .apply()
      return@AsyncFunction true
    }

    AsyncFunction("updateWidget") { levelPercent: Int, ratePerHour: Double, mode: String?, chargerName: String? ->
      val editor = CycleSensePrefs.prefs(context).edit()
      editor.putInt(CycleSensePrefs.KEY_WIDGET_LEVEL, levelPercent)
      editor.putFloat(CycleSensePrefs.KEY_WIDGET_RATE, ratePerHour.toFloat())
      editor.putString(CycleSensePrefs.KEY_WIDGET_MODE, mode ?: "")
      if (chargerName == null) editor.remove(CycleSensePrefs.KEY_WIDGET_CHARGER) else editor.putString(CycleSensePrefs.KEY_WIDGET_CHARGER, chargerName)
      editor.putLong(CycleSensePrefs.KEY_WIDGET_UPDATED, System.currentTimeMillis())
      editor.apply()
      CycleSenseWidgetProvider.refreshAll(context.applicationContext)
      return@AsyncFunction true
    }
  }

  private fun registerTelemetryReceiver() {
    if (telemetryReceiver != null) return
    val weak = WeakReference(this@CycleSenseNativeModule)
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(ctx: Context?, intent: Intent?) {
        if (ctx == null) return
        val snapshot = BatteryTelemetry.snapshot(ctx)
        val bundle = Bundle().apply { putString("payload", snapshot.toString()) }
        try {
          weak.get()?.sendEvent(TELEMETRY_EVENT, bundle)
        } catch (_: Throwable) {
          // event bridge not ready, ignore
        }
      }
    }
    context.applicationContext.registerReceiver(receiver, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
    telemetryReceiver = receiver
  }

  private fun unregisterTelemetryReceiver() {
    val current = telemetryReceiver ?: return
    try {
      context.applicationContext.unregisterReceiver(current)
    } catch (_: Throwable) {
      // already unregistered
    }
    telemetryReceiver = null
  }

  private fun registerScreenReceiver() {
    if (screenReceiver != null) return
    val weak = WeakReference(this@CycleSenseNativeModule)
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(ctx: Context?, intent: Intent?) {
        val action = intent?.action ?: return
        val isOn = action == Intent.ACTION_SCREEN_ON
        val payload = JSONObject().apply {
          put("screenOn", isOn)
          put("timestamp", System.currentTimeMillis())
        }
        val bundle = Bundle().apply { putString("payload", payload.toString()) }
        try {
          weak.get()?.sendEvent(SCREEN_EVENT, bundle)
        } catch (_: Throwable) {
          // event bridge not ready
        }
      }
    }
    val filter = IntentFilter().apply {
      addAction(Intent.ACTION_SCREEN_ON)
      addAction(Intent.ACTION_SCREEN_OFF)
    }
    context.applicationContext.registerReceiver(receiver, filter)
    screenReceiver = receiver
  }

  private fun unregisterScreenReceiver() {
    val current = screenReceiver ?: return
    try {
      context.applicationContext.unregisterReceiver(current)
    } catch (_: Throwable) {
      // already unregistered
    }
    screenReceiver = null
  }

  /**
   * Flips which activity-alias is enabled so the home-screen launcher icon
   * reflects live battery state (green while charging, amber while
   * draining). The aliases and their icons are declared by the
   * withDynamicIcon config plugin, which also strips the LAUNCHER
   * intent-filter off the real MainActivity so exactly one of these two is
   * ever the visible entry point.
   *
   * DONT_KILL_APP matters here: without it, Android would kill and restart
   * the app's process every time the icon flips, which would happen on
   * every plug/unplug - an unacceptable disruption for something this minor.
   */
  private fun setDynamicIcon(charging: Boolean) {
    try {
      val pm = context.applicationContext.packageManager
      val chargingAlias = ComponentName(context.applicationContext.packageName, "expo.modules.cyclesense.LauncherCharging")
      val dischargingAlias = ComponentName(context.applicationContext.packageName, "expo.modules.cyclesense.LauncherDischarging")
      val (toEnable, toDisable) = if (charging) chargingAlias to dischargingAlias else dischargingAlias to chargingAlias
      pm.setComponentEnabledSetting(toDisable, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
      pm.setComponentEnabledSetting(toEnable, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
    } catch (_: Throwable) {
      // Some OEM launchers are slow to pick up component-enabled changes, and
      // a small number outright ignore them - this is cosmetic, never worth
      // crashing the session-tracking flow over.
    }
  }

  private fun jsonToMap(json: JSONObject): Map<String, Any?> {
    val out = mutableMapOf<String, Any?>()
    val keys = json.keys()
    while (keys.hasNext()) {
      val key = keys.next()
      out[key] = coerce(json.get(key))
    }
    return out
  }

  private fun jsonToList(json: JSONArray): List<Any?> {
    val out = mutableListOf<Any?>()
    for (i in 0 until json.length()) out.add(coerce(json.get(i)))
    return out
  }

  private fun coerce(value: Any?): Any? = when (value) {
    JSONObject.NULL -> null
    is JSONObject -> jsonToMap(value)
    is JSONArray -> jsonToList(value)
    else -> value
  }
}