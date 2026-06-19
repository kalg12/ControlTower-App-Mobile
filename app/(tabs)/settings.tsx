import { View, Text, Switch, TouchableOpacity, Alert, ScrollView } from "react-native";
import { useState } from "react";
import { useAuthStore } from "@/stores/auth.store";

export default function SettingsScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [notifAssigned, setNotifAssigned] = useState(true);
  const [notifReply, setNotifReply] = useState(true);
  const [notifSla, setNotifSla] = useState(true);

  function confirmLogout() {
    Alert.alert("Cerrar sesión", "¿Estás seguro?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Cerrar sesión", style: "destructive", onPress: logout },
    ]);
  }

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <View className="bg-white border-b border-gray-200 px-4 pt-16 pb-4">
        <Text className="text-xl font-bold text-gray-900">Ajustes</Text>
      </View>

      {/* Profile */}
      <View className="mx-4 mt-4 bg-white rounded-2xl p-5 shadow-sm">
        <View className="w-14 h-14 rounded-full bg-brand items-center justify-center mb-3">
          <Text className="text-white text-2xl font-bold">
            {user?.fullName?.[0] ?? "?"}
          </Text>
        </View>
        <Text className="text-lg font-bold text-gray-900">{user?.fullName}</Text>
        <Text className="text-gray-500 text-sm">{user?.email}</Text>
      </View>

      {/* Notifications */}
      <View className="mx-4 mt-4 bg-white rounded-2xl shadow-sm overflow-hidden">
        <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 pt-4 pb-2">
          Notificaciones push
        </Text>
        <ToggleRow
          label="Tickets asignados a mí"
          value={notifAssigned}
          onToggle={setNotifAssigned}
        />
        <ToggleRow
          label="Nuevas respuestas en mis tickets"
          value={notifReply}
          onToggle={setNotifReply}
        />
        <ToggleRow
          label="Alertas de SLA"
          value={notifSla}
          onToggle={setNotifSla}
          last
        />
      </View>

      {/* Logout */}
      <View className="mx-4 mt-4 mb-10">
        <TouchableOpacity
          onPress={confirmLogout}
          className="bg-red-50 border border-red-200 rounded-2xl py-4 items-center"
        >
          <Text className="text-red-600 font-semibold text-base">Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function ToggleRow({
  label,
  value,
  onToggle,
  last = false,
}: {
  label: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  last?: boolean;
}) {
  return (
    <View className={`flex-row items-center justify-between px-5 py-4 ${!last ? "border-b border-gray-100" : ""}`}>
      <Text className="text-gray-800 text-sm flex-1 mr-4">{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ true: "#F96E1B", false: "#E5E7EB" }}
        thumbColor="#fff"
      />
    </View>
  );
}
