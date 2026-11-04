import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { create } from "zustand";
import {
  createApiClient,
  Session,
  TokenStorage,
  User,
  validateBaseUrl,
} from "../api/client";
let previewSession: Session | null = null;
export const tokenStorage: TokenStorage = {
  async read() {
    if (Platform.OS === "web") return previewSession;
    const raw = await SecureStore.getItemAsync("quant.session");
    return raw ? (JSON.parse(raw) as Session) : null;
  },
  async write(session) {
    if (Platform.OS === "web") {
      previewSession = session;
      return;
    }
    await SecureStore.setItemAsync("quant.session", JSON.stringify(session), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },
  async clear() {
    previewSession = null;
    if (Platform.OS !== "web")
      await SecureStore.deleteItemAsync("quant.session");
  },
};
export const useSession = create<{
  user: User | null;
  ready: boolean;
  locked: boolean;
  online: boolean;
  biometric: boolean;
  setUser(user: User | null): void;
  setLocked(value: boolean): void;
  setOnline(value: boolean): void;
  setBiometric(value: boolean): void;
}>((set) => ({
  user: null,
  ready: false,
  locked: false,
  online: true,
  biometric: false,
  setUser: (user) => set({ user, ready: true }),
  setLocked: (locked) => set({ locked }),
  setOnline: (online) => set({ online }),
  setBiometric: (biometric) => set({ biometric }),
}));
export const configuredUrl = process.env.EXPO_PUBLIC_API_URL || "";
export let configurationError = "";
let baseUrl = "";
try {
  baseUrl = validateBaseUrl(
    configuredUrl,
    __DEV__ && process.env.EXPO_PUBLIC_ALLOW_LOCAL_HTTP === "true",
  );
} catch (error) {
  configurationError =
    error instanceof Error ? error.message : "Configure EXPO_PUBLIC_API_URL.";
}
export const apiOrigin = baseUrl;
export const api = createApiClient({
  baseUrl,
  storage: tokenStorage,
  onExpired: () => useSession.getState().setUser(null),
});
export async function restoreSession() {
  try {
    const session = await tokenStorage.read();
    const biometric =
      Platform.OS !== "web" &&
      (await SecureStore.getItemAsync("quant.biometric")) === "true";
    useSession.getState().setBiometric(biometric);
    useSession.getState().setLocked(biometric && !!session);
    useSession.getState().setUser(session?.user || null);
  } catch {
    await tokenStorage.clear();
    useSession.getState().setUser(null);
  }
}
