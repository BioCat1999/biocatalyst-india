import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors } from "../theme";
import type { MainTabParamList, RootStackParamList } from "./types";
import { prefetchIpos } from "../ipoCache";
import { prefetchPrimaryContent } from "../contentCache";
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
      <Ionicons name="search-outline" size={22} color={colors.white} />
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
      style={styles.ipoButton}
    >
      <Ionicons name="trending-up-outline" size={18} color={colors.white} />
      <Text style={styles.ipoButtonText}>IPO</Text>
    </Pressable>
  );
}

function InsightsButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="AI intelligence dashboard"
      style={styles.insightsButton}
    >
      <Text style={styles.insightsButtonText}>AI</Text>
    </Pressable>
  );
}

function CalendarButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Catalyst calendar"
      style={styles.insightsButton}
    >
      <Ionicons name="calendar-outline" size={18} color={colors.white} />
    </Pressable>
  );
}

/**
 * Bottom tabs: Feed, Search, Global, Watchlist, Alerts, Account.
 * RootNavigator only mounts this navigator for authenticated members.
 */
export function MainTabs() {
  const insets = useSafeAreaInsets();

  React.useEffect(() => {
    // Share background requests with the screens themselves. This warms the
    // secondary sections without downloading private account data eagerly.
    prefetchPrimaryContent();
    prefetchIpos();
  }, []);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.navy },
        headerTintColor: colors.white,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: "800", fontSize: 18 },
        tabBarActiveTintColor: colors.teal,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700", marginBottom: 6 },
        tabBarStyle: {
          height: 62 + insets.bottom,
          paddingTop: 7,
          paddingBottom: Math.max(insets.bottom, 6),
          borderTopColor: colors.line,
          backgroundColor: colors.card,
        },
        tabBarIcon: ({ color, size, focused }) => {
          const icons = {
            Feed: focused ? "pulse" : "pulse-outline",
            Search: focused ? "search" : "search-outline",
            Global: focused ? "globe" : "globe-outline",
            Watchlist: focused ? "bookmark" : "bookmark-outline",
            Alerts: focused ? "notifications" : "notifications-outline",
            Account: focused ? "person-circle" : "person-circle-outline",
          } as const;
          return <Ionicons name={icons[route.name]} size={focused ? size + 1 : size} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="Feed"
        component={FeedScreen}
        options={({ navigation }) => ({
          title: "Catalyst Feed",
          headerRight: () => (
            <View style={styles.headerRow}>
              <CalendarButton
                onPress={() =>
                  navigation
                    .getParent<NativeStackNavigationProp<RootStackParamList>>()
                    ?.navigate("Calendar")
                }
              />
              <InsightsButton
                onPress={() =>
                  navigation
                    .getParent<NativeStackNavigationProp<RootStackParamList>>()
                    ?.navigate("Insights")
                }
              />
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
            <View style={styles.headerRow}>
              <Pressable
                onPress={() => navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.navigate("Monitors")}
                accessibilityRole="button"
                accessibilityLabel="Smart monitors"
                style={styles.ipoButton}
              >
                <Ionicons name="options-outline" size={17} color={colors.white} />
                <Text style={styles.ipoButtonText}>MONITORS</Text>
              </Pressable>
              <SearchButton onPress={() => navigation.navigate("Search", { scope: "companies" })} />
            </View>
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
  headerButton: { marginRight: 14, padding: 5 },
  ipoButton: {
    marginRight: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  insightsButton: {
    marginRight: 6,
    minWidth: 38,
    height: 34,
    paddingHorizontal: 8,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  insightsButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  ipoButtonText: { color: colors.white, fontSize: 12, fontWeight: "800", letterSpacing: 0.4 },
});
