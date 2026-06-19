import { useEffect, useRef } from "react";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { router } from "expo-router";
import { registerPushToken } from "@/api/tickets.api";

// Expo Go removed remote push in SDK 53. Detect it via appOwnership OR executionEnvironment.
const isExpoGo =
  Constants.appOwnership === "expo" ||
  Constants.executionEnvironment === "storeClient";

export function usePushNotifications() {
  const notifListenerRef = useRef<{ remove: () => void } | null>(null);
  const responseListenerRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    if (isExpoGo) return; // Push not available in Expo Go — skip entirely

    let mounted = true;

    // Dynamic import so the module never loads in Expo Go context
    import("expo-notifications").then((Notifications) => {
      if (!mounted) return;

      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });

      registerForPushNotifications(Notifications);

      notifListenerRef.current = Notifications.addNotificationReceivedListener(() => {});

      responseListenerRef.current = Notifications.addNotificationResponseReceivedListener(
        (response) => {
          const data = response.notification.request.content.data as { ticketId?: string };
          if (data?.ticketId) {
            router.push({ pathname: "/(tabs)/tickets/[id]", params: { id: data.ticketId } });
          }
        }
      );
    });

    return () => {
      mounted = false;
      notifListenerRef.current?.remove();
      responseListenerRef.current?.remove();
    };
  }, []);
}

async function registerForPushNotifications(Notifications: typeof import("expo-notifications")) {
  if (!Device.isDevice) return;

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );

    await registerPushToken(tokenData.data, Platform.OS === "ios" ? "ios" : "android");

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }
  } catch {
    // Non-critical — app works without push
  }
}
