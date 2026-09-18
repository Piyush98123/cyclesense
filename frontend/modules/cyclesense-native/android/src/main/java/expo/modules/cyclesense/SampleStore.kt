package expo.modules.cyclesense

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * Bounded, on-device ring buffer of battery samples backed by SharedPreferences.
 * Deliberately simple - CycleSense is local-first and this file never leaves
 * the device. Keeps at most [MAX_SAMPLES] entries.
 */
internal object SampleStore {
  private const val PREFS = "cyclesense.samples"
  private const val KEY = "buffer"
  private const val MAX_SAMPLES = 720 // ~7.5 days at 15 min cadence

  fun prefs(context: Context): SharedPreferences =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  @Synchronized
  fun append(context: Context, sample: JSONObject) {
    val current = read(context)
    current.put(sample)
    val trimmed = if (current.length() > MAX_SAMPLES) {
      val out = JSONArray()
      for (i in current.length() - MAX_SAMPLES until current.length()) out.put(current.get(i))
      out
    } else current
    prefs(context).edit().putString(KEY, trimmed.toString()).apply()
  }

  fun read(context: Context): JSONArray {
    val raw = prefs(context).getString(KEY, null) ?: return JSONArray()
    return try {
      JSONArray(raw)
    } catch (_: Throwable) {
      JSONArray()
    }
  }

  fun tail(context: Context, limit: Int): JSONArray {
    val all = read(context)
    if (limit <= 0 || all.length() <= limit) return all
    val out = JSONArray()
    for (i in all.length() - limit until all.length()) out.put(all.get(i))
    return out
  }

  fun clear(context: Context) {
    prefs(context).edit().remove(KEY).apply()
  }
}
