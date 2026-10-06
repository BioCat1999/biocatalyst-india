import {
  ensurePushToken,
  getStoredPushToken,
  requestPushPermissions,
  PUSH_TOKEN_STORAGE_KEY,
  type PushDeps,
} from "../notifications";

function makeDeps(overrides: Partial<PushDeps> = {}) {
  const notifications = {
    getPermissionsAsync: jest.fn(),
    requestPermissionsAsync: jest.fn(),
    getDevicePushTokenAsync: jest.fn(),
  };
  const store = new Map<string, string>();
  const secureStore = {
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
  };
  const registerToken = jest.fn(async (_token: string) => ({ registered: true }));
  return {
    deps: { notifications, secureStore, registerToken, ...overrides } as PushDeps,
    notifications,
    secureStore,
    registerToken,
    store,
  };
}

describe("push plumbing", () => {
  it("skips the OS prompt when permission is already granted", async () => {
    const { deps, notifications, registerToken, store } = makeDeps();
    notifications.getPermissionsAsync.mockResolvedValue({ granted: true, status: "granted" });
    notifications.getDevicePushTokenAsync.mockResolvedValue({ data: "device-token-1", type: "ios" });

    const result = await ensurePushToken(deps);

    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "granted", token: "device-token-1", registered: true });
    expect(store.get(PUSH_TOKEN_STORAGE_KEY)).toBe("device-token-1");
    expect(registerToken).toHaveBeenCalledWith("device-token-1");
  });

  it("requests permission when undetermined and proceeds on grant", async () => {
    const { deps, notifications } = makeDeps();
    notifications.getPermissionsAsync.mockResolvedValue({ granted: false, status: "undetermined" });
    notifications.requestPermissionsAsync.mockResolvedValue({ granted: true, status: "granted" });
    notifications.getDevicePushTokenAsync.mockResolvedValue({ data: "tok", type: "android" });

    const result = await ensurePushToken(deps);
    expect(notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("granted");
    expect(result.token).toBe("tok");
  });

  it("stops when the user denies permission", async () => {
    const { deps, notifications, registerToken } = makeDeps();
    notifications.getPermissionsAsync.mockResolvedValue({ granted: false, status: "undetermined" });
    notifications.requestPermissionsAsync.mockResolvedValue({ granted: false, status: "denied" });

    const result = await ensurePushToken(deps);
    expect(result).toEqual({ status: "denied", token: null, registered: false });
    expect(notifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
    expect(registerToken).not.toHaveBeenCalled();
  });

  it("reports unavailable when the device token cannot be acquired", async () => {
    const { deps, notifications } = makeDeps();
    notifications.getPermissionsAsync.mockResolvedValue({ granted: true, status: "granted" });
    notifications.getDevicePushTokenAsync.mockRejectedValue(new Error("no FCM"));

    const result = await ensurePushToken(deps);
    expect(result.status).toBe("unavailable");
    expect(result.token).toBeNull();
    expect(result.registered).toBe(false);
  });

  it("keeps the token locally even when backend registration fails", async () => {
    const { deps, notifications, store } = makeDeps({
      registerToken: async () => {
        throw new Error("404");
      },
    });
    notifications.getPermissionsAsync.mockResolvedValue({ granted: true, status: "granted" });
    notifications.getDevicePushTokenAsync.mockResolvedValue({ data: "tok", type: "ios" });

    const result = await ensurePushToken(deps);
    expect(result.status).toBe("granted");
    expect(result.token).toBe("tok");
    expect(result.registered).toBe(false);
    expect(store.get(PUSH_TOKEN_STORAGE_KEY)).toBe("tok");
  });

  it("requestPushPermissions maps a denied answer", async () => {
    const { deps, notifications } = makeDeps();
    notifications.getPermissionsAsync.mockResolvedValue({ granted: false, status: "undetermined" });
    notifications.requestPermissionsAsync.mockResolvedValue({ granted: false, status: "denied" });
    await expect(requestPushPermissions(deps)).resolves.toBe("denied");
  });

  it("getStoredPushToken returns the saved token and null on error", async () => {
    const { deps, store } = makeDeps();
    store.set(PUSH_TOKEN_STORAGE_KEY, "saved-tok");
    await expect(getStoredPushToken(deps.secureStore)).resolves.toBe("saved-tok");
    await expect(
      getStoredPushToken({
        getItemAsync: async () => {
          throw new Error("keychain locked");
        },
      } as never),
    ).resolves.toBeNull();
  });
});
