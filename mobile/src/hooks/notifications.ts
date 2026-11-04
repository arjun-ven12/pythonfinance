import { Platform } from "react-native";
import * as Device from "expo-device";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { api } from "../auth/session";
export const categories = [
  "TRADE",
  "APPROVAL",
  "RISK",
  "SYSTEM",
  "STRATEGY",
  "BROKER",
  "SCANNER",
  "PORTFOLIO",
  "ENGINE",
  "VALIDATION",
] as const;
export async function registerPush(preferences: Record<string, boolean> = {}) {
  if (Platform.OS === "web" || !Device.isDevice)
    throw Error(
      "Push registration requires an installed build on a physical Android device.",
    );
  const projectId =
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId)
    throw Error(
      "Configure your EAS project ID and Android FCM credentials first.",
    );
  await Notifications.setNotificationChannelAsync("trading", {
    name: "Trading activity",
    importance: AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 100, 200],
  });
  const permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted")
    throw Error("Notification permission was not granted.");
  const { data: pushToken } = await Notifications.getExpoPushTokenAsync({
    projectId,
  });
  let installationId = await SecureStore.getItemAsync("quant.installation");
  if (!installationId) {
    installationId = `android_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
    await SecureStore.setItemAsync("quant.installation", installationId);
  }
  return api.request(
    `/api/mobile/devices/${installationId}`,
    { pushToken, enabled: true, preferences },
    "PUT",
  );
}
export async function unregisterPush() {
  if (Platform.OS === "web") return;
  const id = await SecureStore.getItemAsync("quant.installation");
  if (id) await api.request(`/api/mobile/devices/${id}`, undefined, "DELETE");
}
