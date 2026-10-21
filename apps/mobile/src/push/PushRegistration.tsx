import { useEffect } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useAuth } from "../auth/AuthContext";
import { getApiClient } from "../api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function projectId(): string | undefined {
  return (
    Constants.easConfig?.projectId ??
    (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ??
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID
  );
}

/** Request permission only after sign-in, then register an Expo push token. */
export function PushRegistration() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("catalyst-alerts", {
            name: "Catalyst alerts",
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 200, 120, 200],
          });
        }
        const existing = await Notifications.getPermissionsAsync();
        const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();
        if (!permission.granted || cancelled) return;
        const id = projectId();
        if (!id) return;
        const token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
        if (!cancelled) await getApiClient().registerPushToken(token);
      } catch {
        // Push is additive. A missing EAS project, emulator or temporary
        // provider failure must never block the signed-in app experience.
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  return null;
}
