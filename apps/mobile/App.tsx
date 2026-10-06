import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "./src/auth/AuthContext";
import { RootNavigator } from "./src/navigation/RootNavigator";

/**
 * Biocatalyst India — Expo mobile app (Milestone 9).
 *
 * Thin client over the existing /api/v1/* surface; all data and auth
 * come from the web backend. Anonymous browsing works everywhere;
 * watchlist/alerts require sign-in (same rules as web, spec §14).
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </AuthProvider>
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
