import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let initialized = false;
let granted = false;

export async function ensureNotifications(withSound: boolean): Promise<boolean> {
  if (Platform.OS === "web") return false;
  if (initialized) return granted;
  initialized = true;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("cyclesense-alerts", {
        name: "Battery alerts",
        description: "CycleSense charge and discharge thresholds",
        importance: Notifications.AndroidImportance.HIGH,
        sound: withSound ? "default" : null,
        vibrationPattern: [0, 150],
        enableVibrate: true,
        bypassDnd: false,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.status === "granted") {
      granted = true;
      return true;
    }
    const requested = await Notifications.requestPermissionsAsync();
    granted = requested.status === "granted";
  } catch {
    granted = false;
  }
  return granted;
}

export async function sendBatteryAlert(kind: "charge" | "discharge" | "plug" | "unplug", percent: number | null, sound: boolean): Promise<void> {
  const title =
    kind === "charge" ? "Charging threshold reached" :
    kind === "discharge" ? "Battery running low" :
    kind === "plug" ? "Charger connected" :
    "Charger disconnected";
  const percentText = percent === null ? "" : `${percent}%`;
  const body =
    kind === "charge" ? `Battery reached ${percentText} while charging.` :
    kind === "discharge" ? `Battery fell to ${percentText}. Consider plugging in.` :
    kind === "plug" ? `Charge session started at ${percentText}.` :
    `Discharge session started at ${percentText}.`;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { kind, percent }, sound: sound ? "default" : undefined },
      trigger: null,
    });
  } catch {
    // notification bridge unavailable; ignore
  }
}
