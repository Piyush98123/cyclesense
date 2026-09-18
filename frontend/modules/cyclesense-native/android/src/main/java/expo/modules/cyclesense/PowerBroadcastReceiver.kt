package expo.modules.cyclesense

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.SoundPool
import android.os.Handler
import android.os.Looper

/**
 * Manifest-registered receiver that plays a short SoundPool cue on
 * ACTION_POWER_CONNECTED / ACTION_POWER_DISCONNECTED. Works even when the
 * app has been swiped away or force-stopped, subject to Android's own
 * background-execution policies.
 *
 * Uses [BroadcastReceiver.goAsync] so we can wait for the sample to load
 * asynchronously and give the system enough time to play + release before
 * the receiver process is reaped (10s hard cap).
 */
class PowerBroadcastReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return
    val isPlugIn = action == Intent.ACTION_POWER_CONNECTED
    val isUnplug = action == Intent.ACTION_POWER_DISCONNECTED
    if (!isPlugIn && !isUnplug) return

    val prefs = CycleSensePrefs.prefs(context)
    if (!prefs.getBoolean(CycleSensePrefs.KEY_SOUND_CUES, true)) return

    // Respect ringer mode + DND like the playbook says. Fail closed.
    val audio = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
    if (audio.ringerMode != AudioManager.RINGER_MODE_NORMAL) return
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
    if (nm != null && nm.currentInterruptionFilter != NotificationManager.INTERRUPTION_FILTER_ALL) return

    val resName = if (isPlugIn) "cyclesense_plug_in" else "cyclesense_unplug"
    val resId = context.resources.getIdentifier(resName, "raw", context.packageName)
    if (resId == 0) return

    val pending = goAsync()
    val attrs = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    val pool = SoundPool.Builder()
      .setMaxStreams(1)
      .setAudioAttributes(attrs)
      .build()

    val mainHandler = Handler(Looper.getMainLooper())
    pool.setOnLoadCompleteListener { sp, sampleId, status ->
      if (status == 0) {
        sp.play(sampleId, 0.9f, 0.9f, 1, 0, 1f)
      }
      // Give SoundPool ~600ms to finish playing before releasing the pool
      // and letting the receiver process finish.
      mainHandler.postDelayed({
        try { sp.release() } catch (_: Throwable) {}
        try { pending.finish() } catch (_: Throwable) {}
      }, 600)
    }
    try {
      pool.load(context, resId, 1)
    } catch (_: Throwable) {
      try { pool.release() } catch (_: Throwable) {}
      try { pending.finish() } catch (_: Throwable) {}
    }
  }
}
