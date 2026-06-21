import {
  View,
  Text,
  Switch,
  TouchableOpacity,
  Alert,
  ScrollView,
  StatusBar,
  Modal,
  TextInput,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { useState } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useAuthStore } from "@/stores/auth.store";
import { useAppTheme } from "@/hooks/useAppTheme";
import {
  useTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
} from "@/queries/templates.queries";
import { ResponseTemplate, CreateTemplatePayload } from "@/types/templates";

export default function SettingsScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { barStyle, statusBarBg, iconMuted, iconSecondary, iconEmpty, placeholder } = useAppTheme();

  const [notifAssigned, setNotifAssigned] = useState(true);
  const [notifReply, setNotifReply] = useState(true);
  const [notifSla, setNotifSla] = useState(true);
  const [templatesOpen, setTemplatesOpen] = useState(false);

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
      <StatusBar barStyle={barStyle} backgroundColor={statusBarBg} />

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

      {/* Response templates quick-access */}
      <TouchableOpacity
        onPress={() => setTemplatesOpen(true)}
        className="mx-4 mt-4 bg-dark-surface border border-dark-border rounded-2xl px-5 py-4 flex-row items-center gap-3"
      >
        <View className="w-9 h-9 rounded-xl bg-brand/15 items-center justify-center">
          <Ionicons name="flash-outline" size={18} color="#7C3AED" />
        </View>
        <View className="flex-1">
          <Text className="text-content-primary font-semibold text-sm">Plantillas de respuesta</Text>
          <Text className="text-content-muted text-xs mt-0.5">Gestiona respuestas rápidas</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={iconMuted} />
      </TouchableOpacity>

      {/* Notification toggles */}
      <View className="mx-4 mt-4 bg-dark-surface border border-dark-border rounded-2xl overflow-hidden">
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-2">
          <Ionicons name="notifications-outline" size={16} color={iconSecondary} />
          <Text className="text-content-secondary text-xs font-semibold uppercase tracking-wider">
            Notificaciones push
          </Text>
        </View>
        <ToggleRow
          label="Tickets asignados a mí"
          icon="ticket-outline"
          value={notifAssigned}
          onToggle={setNotifAssigned}
          iconColor={iconMuted}
        />
        <ToggleRow
          label="Nuevas respuestas"
          icon="chatbubble-outline"
          value={notifReply}
          onToggle={setNotifReply}
          iconColor={iconMuted}
        />
        <ToggleRow
          label="Alertas de SLA"
          icon="alert-circle-outline"
          value={notifSla}
          onToggle={setNotifSla}
          iconColor={iconMuted}
          last
        />
      </View>

      {/* App info */}
      <View className="mx-4 mt-4 bg-dark-surface border border-dark-border rounded-2xl overflow-hidden">
        <InfoRow icon="server-outline" label="Servidor" value={process.env.EXPO_PUBLIC_API_URL ?? "—"} iconColor={iconMuted} />
        <InfoRow icon="globe-outline" label="Tenant" value={user?.tenantId?.slice(0, 8) ?? "—"} iconColor={iconMuted} last />
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

      {/* Templates modal */}
      <Modal
        visible={templatesOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setTemplatesOpen(false)}
      >
        <TemplatesManager
          onClose={() => setTemplatesOpen(false)}
          iconMuted={iconMuted}
          iconSecondary={iconSecondary}
          iconEmpty={iconEmpty}
          placeholder={placeholder}
        />
      </Modal>
    </ScrollView>
  );
}

function ToggleRow({
  label,
  icon,
  value,
  onToggle,
  iconColor,
  last = false,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: boolean;
  onToggle: (v: boolean) => void;
  iconColor: string;
  last?: boolean;
}) {
  const { switchOff } = useAppTheme();
  return (
    <View
      className={`flex-row items-center justify-between px-5 py-3.5 ${
        !last ? "border-b border-dark-border" : ""
      }`}
    >
      <View className="flex-row items-center gap-3 flex-1">
        <Ionicons name={icon} size={16} color={iconColor} />
        <Text className="text-content-primary text-sm">{label}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ true: "#7C3AED", false: switchOff }}
        thumbColor="#fff"
      />
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
  iconColor,
  last = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  iconColor: string;
  last?: boolean;
}) {
  return (
    <View
      className={`flex-row items-center px-5 py-3.5 gap-3 ${
        !last ? "border-b border-dark-border" : ""
      }`}
    >
      <Ionicons name={icon} size={16} color={iconColor} />
      <Text className="text-content-secondary text-sm w-20">{label}</Text>
      <Text className="text-content-muted text-xs flex-1 font-mono" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/* ─── Templates Manager ─── */

const EMPTY_FORM: CreateTemplatePayload = { name: "", body: "", category: "", shortcut: "" };

function TemplatesManager({
  onClose,
  iconMuted,
  iconSecondary,
  iconEmpty,
  placeholder,
}: {
  onClose: () => void;
  iconMuted: string;
  iconSecondary: string;
  iconEmpty: string;
  placeholder: string;
}) {
  const { data: templates, isLoading } = useTemplates();
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const deleteTemplate = useDeleteTemplate();

  const [editing, setEditing] = useState<ResponseTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CreateTemplatePayload>(EMPTY_FORM);

  function openCreate() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setForm(EMPTY_FORM);
    setEditing(null);
    setCreating(true);
  }

  function openEdit(t: ResponseTemplate) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setForm({ name: t.name, body: t.body, category: t.category ?? "", shortcut: t.shortcut ?? "" });
    setEditing(t);
    setCreating(true);
  }

  function handleSave() {
    const payload: CreateTemplatePayload = {
      name: form.name.trim(),
      body: form.body.trim(),
      category: form.category?.trim() || undefined,
      shortcut: form.shortcut?.trim() || undefined,
    };
    if (!payload.name || !payload.body) {
      Alert.alert("Error", "El nombre y el contenido son obligatorios");
      return;
    }
    if (editing) {
      updateTemplate.mutate(
        { id: editing.id, payload },
        {
          onSuccess: () => setCreating(false),
          onError: () => Alert.alert("Error", "No se pudo actualizar la plantilla"),
        },
      );
    } else {
      createTemplate.mutate(payload, {
        onSuccess: () => setCreating(false),
        onError: () => Alert.alert("Error", "No se pudo crear la plantilla"),
      });
    }
  }

  function handleDelete(t: ResponseTemplate) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Eliminar plantilla", `¿Eliminar "${t.name}"?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: () =>
          deleteTemplate.mutate(t.id, {
            onError: () => Alert.alert("Error", "No se pudo eliminar la plantilla"),
          }),
      },
    ]);
  }

  if (creating) {
    return (
      <View className="flex-1 bg-dark-bg">
        <View className="bg-dark-surface border-b border-dark-border pt-14 px-4 pb-4">
          <View className="flex-row items-center justify-between">
            <TouchableOpacity onPress={() => setCreating(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text className="text-brand-light text-sm font-medium">Cancelar</Text>
            </TouchableOpacity>
            <Text className="text-content-primary font-bold text-base">
              {editing ? "Editar plantilla" : "Nueva plantilla"}
            </Text>
            <TouchableOpacity
              onPress={handleSave}
              disabled={createTemplate.isPending || updateTemplate.isPending}
            >
              {createTemplate.isPending || updateTemplate.isPending ? (
                <ActivityIndicator size={16} color="#7C3AED" />
              ) : (
                <Text className="text-brand-light text-sm font-bold">Guardar</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
        <ScrollView className="flex-1 p-4" keyboardShouldPersistTaps="handled">
          <FormField label="Nombre *" placeholder="Ej: Bienvenida" placeholderColor={placeholder}>
            <TextInput
              className="bg-dark-surface border border-dark-border rounded-xl px-4 py-3 text-content-primary text-sm"
              placeholder="Nombre de la plantilla"
              placeholderTextColor={placeholder}
              value={form.name}
              onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
              returnKeyType="next"
            />
          </FormField>

          <FormField label="Categoría" placeholder="" placeholderColor={placeholder}>
            <TextInput
              className="bg-dark-surface border border-dark-border rounded-xl px-4 py-3 text-content-primary text-sm"
              placeholder="Ej: Soporte, Ventas"
              placeholderTextColor={placeholder}
              value={form.category}
              onChangeText={(v) => setForm((f) => ({ ...f, category: v }))}
              returnKeyType="next"
            />
          </FormField>

          <FormField label="Atajo (shortcut)" placeholder="" placeholderColor={placeholder}>
            <TextInput
              className="bg-dark-surface border border-dark-border rounded-xl px-4 py-3 text-content-primary text-sm"
              placeholder="Ej: bienvenida (sin /)"
              placeholderTextColor={placeholder}
              value={form.shortcut}
              onChangeText={(v) => setForm((f) => ({ ...f, shortcut: v }))}
              returnKeyType="next"
              autoCapitalize="none"
            />
          </FormField>

          <FormField label="Contenido *" placeholder="" placeholderColor={placeholder}>
            <TextInput
              className="bg-dark-surface border border-dark-border rounded-xl px-4 py-3 text-content-primary text-sm"
              placeholder="Escribe el texto de la plantilla..."
              placeholderTextColor={placeholder}
              value={form.body}
              onChangeText={(v) => setForm((f) => ({ ...f, body: v }))}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              style={{ minHeight: 120 }}
            />
          </FormField>
          <View className="h-8" />
        </ScrollView>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-dark-bg">
      <View className="bg-dark-surface border-b border-dark-border pt-14 px-4 pb-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-content-primary font-bold text-xl">Plantillas</Text>
          <View className="flex-row items-center gap-3">
            <TouchableOpacity
              onPress={openCreate}
              className="flex-row items-center gap-1.5 bg-brand/15 border border-brand/30 rounded-full px-3 py-1.5"
            >
              <Ionicons name="add" size={14} color="#7C3AED" />
              <Text className="text-brand-light text-xs font-semibold">Nueva</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={iconSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#7C3AED" size="large" />
        </View>
      ) : (
        <FlatList
          data={templates ?? []}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: 12, gap: 8 }}
          renderItem={({ item: t }) => (
            <View className="bg-dark-surface border border-dark-border rounded-2xl p-4">
              <View className="flex-row items-start justify-between gap-2">
                <View className="flex-1">
                  <View className="flex-row items-center gap-2 mb-1">
                    <Text className="text-content-primary font-semibold text-sm">{t.name}</Text>
                    {t.shortcut && (
                      <View className="bg-dark-raised border border-dark-border rounded px-1.5 py-0.5">
                        <Text className="text-content-muted font-mono text-[10px]">/{t.shortcut}</Text>
                      </View>
                    )}
                    {t.category && (
                      <View className="bg-brand/10 rounded-full px-2 py-0.5">
                        <Text className="text-brand-light text-[10px]">{t.category}</Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-content-muted text-xs leading-4.5" numberOfLines={2}>
                    {t.body}
                  </Text>
                </View>
                <View className="flex-row items-center gap-3 ml-2">
                  <TouchableOpacity onPress={() => openEdit(t)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="pencil-outline" size={16} color={iconSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(t)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View className="items-center py-20">
              <Ionicons name="flash-outline" size={48} color={iconEmpty} />
              <Text className="text-content-muted text-sm mt-3">Sin plantillas todavía</Text>
              <Text className="text-content-muted text-xs mt-1 text-center px-8">
                Crea plantillas para responder tickets más rápido
              </Text>
              <TouchableOpacity
                onPress={openCreate}
                className="mt-4 bg-brand/15 border border-brand/30 rounded-full px-5 py-2.5"
              >
                <Text className="text-brand-light text-sm font-semibold">Crear primera plantilla</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  placeholder: string;
  placeholderColor: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-4">
      <Text className="text-content-muted text-xs font-semibold uppercase tracking-wider mb-2">
        {label}
      </Text>
      {children}
    </View>
  );
}
