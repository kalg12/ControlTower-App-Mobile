import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { router } from "expo-router";
import { registerPushToken } from "@/api/tickets.api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function usePushNotifications() {
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    registerForPushNotifications();

    // Foreground notification received
    notificationListener.current = Notifications.addNotificationReceivedListener(() => {
      // Could update badge count here
    });

    // User tapped on notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { ticketId?: string };
      if (data?.ticketId) {
        router.push({ pathname: "/(tabs)/tickets/[id]", params: { id: data.ticketId } });
      }
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);
}

async function registerForPushNotifications() {
  if (!Device.isDevice) return;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") return;

  const tokenData = await Notifications.getExpoPushTokenAsync();
  const platform = Platform.OS === "ios" ? "ios" : "android";

  try {
    await registerPushToken(tokenData.data, platform);
  } catch (e) {
    // Non-critical — app still works without push
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
}
