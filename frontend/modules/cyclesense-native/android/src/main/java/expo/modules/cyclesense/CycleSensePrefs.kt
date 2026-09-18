package expo.modules.cyclesense

import android.content.Context
import android.content.SharedPreferences

/**
 * Cross-process settings surface. Written by the JS bridge whenever the user
 * flips a setting; read by the manifest-registered PowerBroadcastReceiver so
 * cues can respect user preference even after the app is force-stopped.
 */
object CycleSensePrefs {
  private const val NAME = "cyclesense.settings"
  const val KEY_SOUND_CUES = "soundCues"
  const val KEY_WIDGET_LEVEL = "widget.level"
  const val KEY_WIDGET_RATE = "widget.rate"
  const val KEY_WIDGET_CHARGER = "widget.charger"
  const val KEY_WIDGET_MODE = "widget.mode"
  const val KEY_WIDGET_UPDATED = "widget.updatedAt"

  fun prefs(context: Context): SharedPreferences =
    context.applicationContext.getSharedPreferences(NAME, Context.MODE_PRIVATE)
}
