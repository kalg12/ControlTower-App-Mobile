import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { login, saveTokens } from "@/api/auth.api";
import { useAuthStore } from "@/stores/auth.store";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:8080";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const setUser = useAuthStore((s) => s.setUser);

  async function handleLogin() {
    if (!email.trim() || !password) return;
    setLoading(true);
    try {
      const res = await login({ email: email.trim().toLowerCase(), password });
      await saveTokens(res.accessToken, res.refreshToken);
      setUser(res.user);
      router.replace("/(tabs)");
    } catch (err: any) {
      let msg: string;
      if (!err.response) {
        // Network error — can't reach the server at all
        msg = `No se pudo conectar al servidor.\n\n${API_URL}`;
      } else if (err.response.status === 401 || err.response.status === 403) {
        msg = err.response.data?.message ?? "Correo o contraseña incorrectos.";
      } else {
        msg = err.response.data?.message ?? `Error del servidor (${err.response.status}).`;
      }
      Alert.alert("Error al iniciar sesión", msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-white"
    >
      <View className="flex-1 justify-center px-8">
        <Text className="text-3xl font-bold text-gray-900 mb-2">Control Tower</Text>
        <Text className="text-gray-500 mb-10">Panel de soporte Comerza</Text>

        <Text className="text-sm font-medium text-gray-700 mb-1">Correo electrónico</Text>
        <TextInput
          className="border border-gray-300 rounded-xl px-4 py-3 mb-4 text-gray-900"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          placeholder="tu@comerza.com"
          placeholderTextColor="#9CA3AF"
        />

        <Text className="text-sm font-medium text-gray-700 mb-1">Contraseña</Text>
        <TextInput
          className="border border-gray-300 rounded-xl px-4 py-3 mb-6 text-gray-900"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor="#9CA3AF"
        />

        <TouchableOpacity
          onPress={handleLogin}
          disabled={loading}
          className="bg-brand rounded-xl py-4 items-center"
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text className="text-white font-semibold text-base">Iniciar sesión</Text>
          }
        </TouchableOpacity>

        {__DEV__ && (
          <Text className="text-center text-gray-300 text-xs mt-6" numberOfLines={1}>
            {API_URL}
          </Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
