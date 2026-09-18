package expo.modules.cyclesense

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

/**
 * WorkManager worker that samples the battery once per invocation and appends
 * the snapshot to the local ring buffer. Scheduled as PeriodicWorkRequest by
 * [CycleSenseNativeModule.startBackgroundSampling]. Runs entirely on device.
 */
class BatterySamplingWorker(
  appContext: Context,
  params: WorkerParameters
) : CoroutineWorker(appContext, params) {

  override suspend fun doWork(): Result {
    return try {
      val snapshot = BatteryTelemetry.snapshot(applicationContext)
      SampleStore.append(applicationContext, snapshot)
      // Keep the home-screen widget warm even when the app is force-stopped.
      // Level + mode come straight from the sample; drain rate and charger
      // name are whatever the app last wrote, so we don't overwrite them.
      try {
        val prefs = CycleSensePrefs.prefs(applicationContext)
        val editor = prefs.edit()
        val level = snapshot.optInt("levelPercent", -1)
        val mode = if (snapshot.optBoolean("isCharging", false)) "charging" else "discharging"
        editor.putInt(CycleSensePrefs.KEY_WIDGET_LEVEL, level)
        editor.putString(CycleSensePrefs.KEY_WIDGET_MODE, mode)
        editor.putLong(CycleSensePrefs.KEY_WIDGET_UPDATED, System.currentTimeMillis())
        editor.apply()
        CycleSenseWidgetProvider.refreshAll(applicationContext)
      } catch (_: Throwable) {
        // best-effort widget refresh
      }
      Result.success()
    } catch (_: Throwable) {
      Result.retry()
    }
  }
}
