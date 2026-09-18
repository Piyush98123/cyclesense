package expo.modules.cyclesense

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import org.json.JSONObject

/**
 * Reads a rich, single-shot battery snapshot from the platform. All values are
 * derived from BatteryManager sticky intent + BatteryManager system service so
 * we never hold a broadcast receiver open longer than necessary.
 */
internal object BatteryTelemetry {

  private const val UNKNOWN_INT = Int.MIN_VALUE
  private const val UNKNOWN_LONG = Long.MIN_VALUE

  fun snapshot(context: Context): JSONObject {
    val out = JSONObject()
    out.put("timestamp", System.currentTimeMillis())

    val intent = context.applicationContext.registerReceiver(
      null,
      IntentFilter(Intent.ACTION_BATTERY_CHANGED)
    )

    if (intent == null) {
      out.put("available", false)
      return out
    }

    val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
    val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
    val batteryLevel = if (level >= 0 && scale > 0) level.toFloat() / scale.toFloat() else -1f
    val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, BatteryManager.BATTERY_STATUS_UNKNOWN)
    val plugged = intent.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0)
    val voltageMv = intent.getIntExtra(BatteryManager.EXTRA_VOLTAGE, -1)
    val temperatureTenthsC = intent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, UNKNOWN_INT)
    val technology = intent.getStringExtra(BatteryManager.EXTRA_TECHNOLOGY)
    val health = intent.getIntExtra(BatteryManager.EXTRA_HEALTH, BatteryManager.BATTERY_HEALTH_UNKNOWN)
    val present = intent.getBooleanExtra(BatteryManager.EXTRA_PRESENT, true)

    val manager = context.applicationContext.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
    val currentNow = manager?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW) ?: UNKNOWN_INT
    val currentAverage = manager?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_AVERAGE) ?: UNKNOWN_INT
    val chargeCounter = manager?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CHARGE_COUNTER) ?: UNKNOWN_INT
    val energyCounter = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      manager?.getLongProperty(BatteryManager.BATTERY_PROPERTY_ENERGY_COUNTER) ?: UNKNOWN_LONG
    } else UNKNOWN_LONG
    val capacity = manager?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: UNKNOWN_INT

    out.put("available", present)
    out.put("level", batteryLevel)
    out.put("levelPercent", if (capacity != UNKNOWN_INT) capacity else if (batteryLevel >= 0f) (batteryLevel * 100f).toInt() else -1)
    out.put("statusCode", status)
    out.put("statusLabel", statusLabel(status))
    out.put("pluggedCode", plugged)
    out.put("pluggedLabel", pluggedLabel(plugged))
    out.put("voltageMv", voltageMv)
    out.put("temperatureCelsius", if (temperatureTenthsC == UNKNOWN_INT) null else temperatureTenthsC / 10.0)
    out.put("technology", technology ?: JSONObject.NULL)
    out.put("healthCode", health)
    out.put("healthLabel", healthLabel(health))
    out.put("currentNowMicroA", currentNow)
    out.put("currentAverageMicroA", currentAverage)
    out.put("chargeCounterMicroAh", chargeCounter)
    out.put("energyCounterNanoWh", energyCounter)
    out.put("isCharging", status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL)
    return out
  }

  private fun statusLabel(status: Int): String = when (status) {
    BatteryManager.BATTERY_STATUS_CHARGING -> "charging"
    BatteryManager.BATTERY_STATUS_DISCHARGING -> "discharging"
    BatteryManager.BATTERY_STATUS_FULL -> "full"
    BatteryManager.BATTERY_STATUS_NOT_CHARGING -> "not_charging"
    else -> "unknown"
  }

  private fun pluggedLabel(plugged: Int): String = when (plugged) {
    BatteryManager.BATTERY_PLUGGED_AC -> "ac"
    BatteryManager.BATTERY_PLUGGED_USB -> "usb"
    BatteryManager.BATTERY_PLUGGED_WIRELESS -> "wireless"
    0 -> "unplugged"
    else -> "unknown"
  }

  private fun healthLabel(health: Int): String = when (health) {
    BatteryManager.BATTERY_HEALTH_GOOD -> "good"
    BatteryManager.BATTERY_HEALTH_OVERHEAT -> "overheat"
    BatteryManager.BATTERY_HEALTH_DEAD -> "dead"
    BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE -> "over_voltage"
    BatteryManager.BATTERY_HEALTH_UNSPECIFIED_FAILURE -> "failure"
    BatteryManager.BATTERY_HEALTH_COLD -> "cold"
    else -> "unknown"
  }
}
