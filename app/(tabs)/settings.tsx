import {
  View,
  Text,
  Switch,
  TouchableOpacity,
  Alert,
  ScrollView,
  StatusBar,
} from "react-native";
import { useState } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useAuthStore } from "@/stores/auth.store";

export default function SettingsScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [notifAssigned, setNotifAssigned] = useState(true);
  const [notifReply, setNotifReply] = useState(true);
  const [notifSla, setNotifSla] = useState(true);

  const initials = user?.fullName
    ?.split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("") ?? "?";

  function confirmLogout() {
    Alert.alert("Cerrar sesión", "¿Estás seguro de que quieres salir?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Cerrar sesión",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  }

  return (
    <ScrollView className="flex-1 bg-dark-bg">
      <StatusBar barStyle="light-content" backgroundColor="#0C0C14" />

      {/* Header */}
      <View className="bg-dark-surface border-b border-dark-border px-4 pt-16 pb-4">
        <Text className="text-content-primary text-xl font-bold">Ajustes</Text>
      </View>

      {/* Profile card */}
      <View className="mx-4 mt-4 bg-dark-surface border border-dark-border rounded-2xl p-5">
        <View className="flex-row items-center gap-4">
          {user?.avatarUrl ? (
            <Image
              source={{ uri: user.avatarUrl }}
              style={{ width: 56, height: 56, borderRadius: 16 }}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View className="w-14 h-14 rounded-2xl bg-brand items-center justify-center">
              <Text className="text-white text-xl font-bold">{initials}</Text>
            </View>
          )}
          <View className="flex-1">
            <Text className="text-content-primary font-bold text-base">{user?.fullName}</Text>
            <Text className="text-content-secondary text-sm mt-0.5">{user?.email}</Text>
            {user?.superAdmin && (
              <View className="mt-1.5 self-start bg-brand/20 border border-brand/30 px-2 py-0.5 rounded-full">
                <Text className="text-brand-light text-xs font-semibold">Super Admin</Text>
              </View>
            )}
          </View>
        </View>

        {/* Permissions */}
        {(user?.permissions?.length ?? 0) > 0 && (
          <View className="mt-4 pt-4 border-t border-dark-border">
            <Text className="text-content-muted text-xs uppercase tracking-wider mb-2">
              Permisos
            </Text>
            <View className="flex-row flex-wrap gap-1.5">
              {user?.permissions.slice(0, 6).map((p) => (
                <View key={p} className="bg-dark-raised border border-dark-border px-2 py-0.5 rounded-md">
                  <Text className="text-content-muted text-[10px] font-mono">{p}</Text>
                </View>
              ))}
              {(user?.permissions.length ?? 0) > 6 && (
                <View className="bg-dark-raised border border-dark-border px-2 py-0.5 rounded-md">
                  <Text className="text-content-muted text-[10px]">
                    +{(user?.permissions.length ?? 0) - 6} más
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}
      </View>

      {/* Notification toggles */}
      <View className="mx-4 mt-4 bg-dark-surface border border-dark-border rounded-2xl overflow-hidden">
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-2">
          <Ionicons name="notifications-outline" size={16} color="#8888A0" />
          <Text className="text-content-secondary text-xs font-semibold uppercase tracking-wider">
            Notificaciones push
          </Text>
        </View>
        <ToggleRow
          label="Tickets asignados a mí"
          icon="ticket-outline"
          value={notifAssigned}
          onToggle={setNotifAssigned}
        />
        <ToggleRow
          label="Nuevas respuestas"
          icon="chatbubble-outline"
          value={notifReply}
          onToggle={setNotifReply}
        />
        <ToggleRow
          label="Alertas de SLA"
          icon="alert-circle-outline"
          value={notifSla}
          onToggle={setNotifSla}
          last
        />
      </View>

      {/* App info */}
      <View className="mx-4 mt-4 bg-dark-surface border border-dark-border rounded-2xl overflow-hidden">
        <InfoRow icon="server-outline" label="Servidor" value={process.env.EXPO_PUBLIC_API_URL ?? "—"} />
        <InfoRow icon="globe-outline" label="Tenant" value={user?.tenantId?.slice(0, 8) ?? "—"} last />
      </View>

      {/* Logout */}
      <View className="mx-4 mt-4 mb-10">
        <TouchableOpacity
          onPress={confirmLogout}
          className="bg-red-500/10 border border-red-500/30 rounded-2xl py-4 flex-row items-center justify-center gap-2"
        >
          <Ionicons name="log-out-outline" size={18} color="#EF4444" />
          <Text className="text-red-400 font-semibold text-base">Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function ToggleRow({
  label,
  icon,
  value,
  onToggle,
  last = false,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: boolean;
  onToggle: (v: boolean) => void;
  last?: boolean;
}) {
  return (
    <View
      className={`flex-row items-center justify-between px-5 py-3.5 ${
        !last ? "border-b border-dark-border" : ""
      }`}
    >
      <View className="flex-row items-center gap-3 flex-1">
        <Ionicons name={icon} size={16} color="#4A4A5C" />
        <Text className="text-content-primary text-sm">{label}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ true: "#7C3AED", false: "#2A2A3C" }}
        thumbColor="#fff"
      />
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
  last = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View
      className={`flex-row items-center px-5 py-3.5 gap-3 ${
        !last ? "border-b border-dark-border" : ""
      }`}
    >
      <Ionicons name={icon} size={16} color="#4A4A5C" />
      <Text className="text-content-secondary text-sm w-20">{label}</Text>
      <Text className="text-content-muted text-xs flex-1 font-mono" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
