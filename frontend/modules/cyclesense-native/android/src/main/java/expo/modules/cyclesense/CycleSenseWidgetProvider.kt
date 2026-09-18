package expo.modules.cyclesense

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.widget.RemoteViews

/**
 * Home-screen widget that renders the last known battery snapshot from
 * SharedPreferences. JS writes the snapshot via the native bridge (see
 * `updateWidget`) and the sampling worker also refreshes it after each
 * WorkManager run so the widget stays warm even when the app is stopped.
 */
class CycleSenseWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, mgr: AppWidgetManager, appWidgetIds: IntArray) {
    val prefs = CycleSensePrefs.prefs(context)
    val level = prefs.getInt(CycleSensePrefs.KEY_WIDGET_LEVEL, -1)
    val rate = prefs.getFloat(CycleSensePrefs.KEY_WIDGET_RATE, Float.NaN)
    val charger = prefs.getString(CycleSensePrefs.KEY_WIDGET_CHARGER, null)
    val mode = prefs.getString(CycleSensePrefs.KEY_WIDGET_MODE, null)

    val views = RemoteViews(context.packageName, R.layout.widget_cyclesense)
    views.setTextViewText(R.id.widget_cyclesense_level, if (level < 0) "--%" else "$level%")
    views.setTextViewText(R.id.widget_cyclesense_mode, when (mode) {
      "charge", "charging", "full" -> "Charging"
      "discharge", "discharging" -> "Discharging"
      else -> ""
    })
    val rateText = if (rate.isNaN() || rate == 0f) context.getString(R.string.widget_cyclesense_placeholder) else String.format("%.1f%% / hr", rate)
    views.setTextViewText(R.id.widget_cyclesense_rate, rateText)
    views.setTextViewText(R.id.widget_cyclesense_charger, charger ?: "")

    for (id in appWidgetIds) {
      mgr.updateAppWidget(id, views)
    }
  }

  companion object {
    fun refreshAll(context: Context) {
      val mgr = AppWidgetManager.getInstance(context)
      val cn = ComponentName(context, CycleSenseWidgetProvider::class.java)
      val ids = mgr.getAppWidgetIds(cn)
      if (ids.isEmpty()) return
      val provider = CycleSenseWidgetProvider()
      provider.onUpdate(context, mgr, ids)
    }
  }
}
