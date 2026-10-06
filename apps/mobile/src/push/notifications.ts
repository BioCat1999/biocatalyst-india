/**
 * Push-notification PLUMBING (Milestone 9 scope — spec §14).
 *
 * Implemented: permission-request flow, native device-token acquisition,
 * local persistence, and a registration call against the app's own API.
 *
 * Deliberately NOT done (documented in README.md / docs/deployment.md):
 * real FCM/APNs credentials, an Expo projectId, EAS cloud builds, and
 * server-side push fan-out (delivery). The registration endpoint
 * `/api/v1/push-tokens` exists as of Milestone 10; the client's
 * `registerPushToken` reports `registered: true` when the server
 * accepts the token. No pushes are sent yet — only registered.
 *
 * Privacy: token acquisition uses `getDevicePushTokenAsync()` — a purely
 * local native call. `getExpoPushTokenAsync()` is NOT used because it
 * contacts Expo's push servers and requires an Expo account/projectId.
 * The only network call here targets the user's own API base URL.
 */
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { getApiClient } from "../api";

export const PUSH_TOKEN_STORAGE_KEY = "biocatalyst.pushToken";

export type PushSetupStatus =
  | "granted"
  | "denied"
  | "undetermined"
  | "unavailable"
  | "error";

export interface PushSetupResult {
  status: PushSetupStatus;
  /** Native device push token, when one could be acquired. */
  token: string | null;
  /** Whether the backend accepted the token (false until the endpoint exists). */
  registered: boolean;
  detail?: string;
}

/** Injectable seams so the flow is unit-testable without native modules. */
export interface PushDeps {
  notifications?: Pick<
    typeof Notifications,
    "getPermissionsAsync" | "requestPermissionsAsync" | "getDevicePushTokenAsync"
  >;
  secureStore?: Pick<typeof SecureStore, "getItemAsync" | "setItemAsync">;
  registerToken?: (token: string) => Promise<{ registered: boolean }>;
}

const defaultDeps: Required<PushDeps> = {
  notifications: Notifications,
  secureStore: SecureStore,
  registerToken: (token) => getApiClient().registerPushToken(token),
};

/**
 * Ask the OS for notification permission. Returns the resulting status.
 * Safe to call repeatedly — the OS only prompts when undetermined.
 */
export async function requestPushPermissions(
  deps: PushDeps = {},
): Promise<PushSetupStatus> {
  const n = { ...defaultDeps, ...deps }.notifications;
  try {
    const current = await n.getPermissionsAsync();
    if (current.granted) return "granted";
    const asked = await n.requestPermissionsAsync();
    if (asked.granted) return "granted";
    return asked.status === "denied" ? "denied" : "undetermined";
  } catch (err) {
    return "error";
  }
}

/**
 * Full setup flow: permissions → native device token → local persistence
 * → registration call against the app's own API (stubbed server-side).
 *
 * Never throws: failures are reported in the result so the UI can show
 * a plain-language explanation and the user can retry later.
 */
export async function ensurePushToken(deps: PushDeps = {}): Promise<PushSetupResult> {
  const { notifications, secureStore, registerToken } = { ...defaultDeps, ...deps };
  try {
    const status = await requestPushPermissions({ notifications });
    if (status !== "granted") {
      return { status, token: null, registered: false };
    }
    let token: string;
    try {
      const deviceToken = await notifications.getDevicePushTokenAsync();
      token = deviceToken.data;
    } catch {
      return {
        status: "unavailable",
        token: null,
        registered: false,
        detail: "Could not obtain a device push token on this device/emulator.",
      };
    }
    await secureStore.setItemAsync(PUSH_TOKEN_STORAGE_KEY, token);
    let registered = false;
    try {
      registered = (await registerToken(token)).registered;
    } catch {
      registered = false;
    }
    return { status: "granted", token, registered };
  } catch (err) {
    return {
      status: "error",
      token: null,
      registered: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/** The last-known device token, if setup previously succeeded. */
export async function getStoredPushToken(
  secureStore: PushDeps["secureStore"] = SecureStore,
): Promise<string | null> {
  try {
    return await secureStore.getItemAsync(PUSH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}
