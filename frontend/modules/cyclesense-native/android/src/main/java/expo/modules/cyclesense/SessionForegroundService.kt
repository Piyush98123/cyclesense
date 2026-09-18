package expo.modules.cyclesense

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Lightweight foreground Service that keeps a persistent, low-priority
 * notification while a battery session is open. The notification itself does
 * no work - its only purpose is to prevent the OS from tearing the process
 * down mid-charge so the WorkManager sampler and telemetry receiver stay
 * alive. Started from JS via [CycleSenseNativeModule.startSessionForeground].
 */
class SessionForegroundService : Service() {

  companion object {
    const val CHANNEL_ID = "cyclesense.session"
    const val CHANNEL_NAME = "Session tracking"
    const val NOTIFICATION_ID = 4211
    const val EXTRA_MODE = "mode"
    const val EXTRA_START_LEVEL = "startLevel"
    const val ACTION_START = "expo.modules.cyclesense.ACTION_START"
    const val ACTION_STOP = "expo.modules.cyclesense.ACTION_STOP"
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopForegroundCompat()
      stopSelf()
      return START_NOT_STICKY
    }
    val mode = intent?.getStringExtra(EXTRA_MODE) ?: "session"
    val startLevel = intent?.getIntExtra(EXTRA_START_LEVEL, -1) ?: -1
    ensureChannel()
    val notification = buildNotification(mode, startLevel)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    return START_STICKY
  }

  private fun buildNotification(mode: String, startLevel: Int): Notification {
    val title = if (mode == "charge") "Charge session in progress" else "Discharge session in progress"
    val body = if (startLevel in 0..100) "Started at $startLevel% · CycleSense is tracking on-device" else "CycleSense is tracking this cycle on-device"
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(body)
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setOngoing(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .build()
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW).apply {
      description = "Kept quietly running while a battery session is open."
      setShowBadge(false)
      enableLights(false)
      enableVibration(false)
    }
    manager.createNotificationChannel(channel)
  }

  private fun stopForegroundCompat() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
  }
}
