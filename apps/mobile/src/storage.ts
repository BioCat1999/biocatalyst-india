/**
 * expo-secure-store-backed TokenStorage for the shared ApiClient.
 *
 * The session token (`bc_session`) lives in the OS keychain/keystore,
 * never in plain AsyncStorage and never in logs. This is the mobile
 * counterpart of the web's httpOnly cookie: the raw token is held
 * securely on-device and attached as a Cookie header by the client.
 */
import * as SecureStore from "expo-secure-store";
import type { TokenStorage } from "@biocatalyst/api-client";

export const secureTokenStorage: TokenStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};
