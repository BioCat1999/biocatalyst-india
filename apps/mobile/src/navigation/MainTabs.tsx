import React from "react";
import { Pressable, Text, StyleSheet, View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors } from "../theme";
import type { MainTabParamList, RootStackParamList } from "./types";
import { FeedScreen } from "../screens/FeedScreen";
import { SearchScreen } from "../screens/SearchScreen";
import { GlobalScreen } from "../screens/GlobalScreen";
import { WatchlistScreen } from "../screens/WatchlistScreen";
import { AlertsScreen } from "../screens/AlertsScreen";
import { AccountScreen } from "../screens/AccountScreen";

const Tab = createBottomTabNavigator<MainTabParamList>();

/**
 * Header search button. Each tab scopes the Search tab to the content
 * the user is currently looking at (Feed -> event results, Watchlist ->
 * company results, ...), so a keyword search surfaces the relevant
 * things for that tab.
 */
function SearchButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Search"
      style={styles.headerButton}
    >
      <Text style={styles.headerIcon}>{"\uD83D\uDD0D"}</Text>
    </Pressable>
  );
}

/**
 * Header IPO button — opens the IPO tracker stack screen. The navigate
 * action bubbles up from the tab navigator to the root stack.
 */
function IpoButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="IPO tracker"
      style={styles.headerButton}
    >
      <Text style={styles.headerIcon}>{"\uD83D\uDCC8"}</Text>
    </Pressable>
  );
}

/**
 * Bottom tabs: Feed, Search, Global, Watchlist, Alerts, Account.
 * Anonymous browsing works on every tab; Watchlist/Alerts/Account
 * prompt for sign-in when no session exists (same rules as web).
 */
export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.navy },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: "700" },
        tabBarActiveTintColor: colors.teal,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tab.Screen
        name="Feed"
        component={FeedScreen}
        options={({ navigation }) => ({
          title: "Catalyst Feed",
          headerRight: () => (
            <View style={styles.headerRow}>
              <IpoButton
                onPress={() =>
                  navigation
                    .getParent<NativeStackNavigationProp<RootStackParamList>>()
                    ?.navigate("Ipo")
                }
              />
              <SearchButton onPress={() => navigation.navigate("Search", { scope: "events" })} />
            </View>
          ),
        })}
      />
      <Tab.Screen name="Search" component={SearchScreen} options={{ title: "Search" }} />
      <Tab.Screen
        name="Global"
        component={GlobalScreen}
        options={({ navigation }) => ({
          title: "Global pharma",
          headerRight: () => (
            <SearchButton onPress={() => navigation.navigate("Search", { scope: "companies" })} />
          ),
        })}
      />
      <Tab.Screen
        name="Watchlist"
        component={WatchlistScreen}
        options={({ navigation }) => ({
          title: "Watchlist",
          headerRight: () => (
            <SearchButton onPress={() => navigation.navigate("Search", { scope: "companies" })} />
          ),
        })}
      />
      <Tab.Screen
        name="Alerts"
        component={AlertsScreen}
        options={({ navigation }) => ({
          title: "Alerts",
          headerRight: () => (
            <SearchButton onPress={() => navigation.navigate("Search", { scope: "events" })} />
          ),
        })}
      />
      <Tab.Screen
        name="Account"
        component={AccountScreen}
        options={({ navigation }) => ({
          title: "Account",
          headerRight: () => <SearchButton onPress={() => navigation.navigate("Search")} />,
        })}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center" },
  headerButton: { marginRight: 16, padding: 4 },
  headerIcon: { fontSize: 20, color: colors.white },
});
