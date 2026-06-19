import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:8080";

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await SecureStore.getItemAsync("accessToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  // Interceptor de respuesta exitosa: desenvuelve el wrapper { success, data } del backend
  // para que el código que consume la API reciba directamente el payload útil.
  (response) => {
    if (response.data && "data" in response.data) {
      response.data = response.data.data;
    }
    return response;
  },

  // Interceptor de error: maneja el 401 (No Autorizado) de forma transparente.
  //
  // ¿Por qué necesitamos esto si ya validamos el token al abrir la app?
  // El accessToken puede vencer MIENTRAS el usuario usa la app (típicamente dura 15-60 min).
  // En lugar de mostrar un error feo, este interceptor lo renueva silenciosamente y reintenta
  // la misma petición que falló — el usuario no nota nada.
  async (error) => {
    if (error.response?.status === 401) {
      try {
        const refreshToken = await SecureStore.getItemAsync("refreshToken");
        if (refreshToken) {
          // Usamos axios directo (no apiClient) para evitar un loop infinito:
          // si apiClient hiciera esta petición y también recibiera 401,
          // volvería a entrar a este interceptor indefinidamente.
          const res = await axios.post(`${BASE_URL}/api/v1/auth/refresh`, { refreshToken });
          const newAccess: string = res.data.data.accessToken;
          const newRefresh: string = res.data.data.refreshToken ?? refreshToken;

          // Guardamos AMBOS tokens. Algunos backends usan "refresh token rotation":
          // cada vez que renuevas, el servidor invalida el refreshToken anterior y entrega
          // uno nuevo. Si solo guardamos el accessToken y el backend rotó el refresh,
          // el próximo intento de renovación fallará y el usuario perderá la sesión.
          await SecureStore.setItemAsync("accessToken", newAccess);
          await SecureStore.setItemAsync("refreshToken", newRefresh);

          // Reintentamos la petición original con el nuevo token
          error.config.headers.Authorization = `Bearer ${newAccess}`;
          return apiClient.request(error.config);
        }
      } catch {
        // El refreshToken también venció o es inválido — sesión expirada definitivamente.
      }

      // Limpiamos TODO el estado de sesión del SecureStore.
      // Importante incluir "authUser": si solo borramos los tokens pero dejamos authUser,
      // la próxima hidratación al abrir la app encontraría un usuario sin token y devolvería
      // null correctamente, pero si el código evolucionara podría haber confusión.
      await SecureStore.deleteItemAsync("accessToken");
      await SecureStore.deleteItemAsync("refreshToken");
      await SecureStore.deleteItemAsync("authUser");

      // Redirigimos al login. router.replace() (no push) evita que el usuario
      // pueda volver atrás con el botón Back a una pantalla que requiere auth.
      router.replace("/(auth)/login");
    }
    return Promise.reject(error);
  }
);
