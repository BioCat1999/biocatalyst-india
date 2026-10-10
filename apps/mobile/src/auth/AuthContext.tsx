/**
 * Auth state for the mobile app.
 *
 * Same rules as web (spec §14): anonymous browsing everywhere; the
 * session is only needed for watchlist/alerts. The session token itself
 * never leaves expo-secure-store — components only see the public
 * user profile returned by the API.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ApiError, type AuthUserProfile } from "@biocatalyst/api-client";
import { getApiClient } from "../api";

interface AuthContextValue {
  user: AuthUserProfile | null;
  /** True while the initial session restore is running. */
  initializing: boolean;
  /** True while a sign-in/sign-up/sign-out call is in flight. */
  busy: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Permanently delete the account, then return to anonymous browsing. */
  deleteAccount: () => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return err instanceof Error ? err.message : "Something went wrong";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUserProfile | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const session = await getApiClient().getSession();
      setUser(session.user);
    } catch {
      // Offline or server down: keep whatever we had; screens show retry.
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setInitializing(false));
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    setBusy(true);
    setError(null);
    try {
      const profile = await getApiClient().signIn(email.trim(), password);
      setUser(profile);
    } catch (err) {
      setError(toMessage(err));
      throw err;
    } finally {
      setBusy(false);
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    setBusy(true);
    setError(null);
    try {
      const profile = await getApiClient().signUp(email.trim(), password);
      setUser(profile);
    } catch (err) {
      setError(toMessage(err));
      throw err;
    } finally {
      setBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setBusy(true);
    try {
      await getApiClient().signOut();
      setUser(null);
    } finally {
      setBusy(false);
    }
  }, []);

  const deleteAccount = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await getApiClient().deleteAccount();
      setUser(null);
    } catch (err) {
      setError(toMessage(err));
      throw err;
    } finally {
      setBusy(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo(
    () => ({
      user,
      initializing,
      busy,
      error,
      signIn,
      signUp,
      signOut,
      deleteAccount,
      refresh,
      clearError,
    }),
    [user, initializing, busy, error, signIn, signUp, signOut, deleteAccount, refresh, clearError],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
