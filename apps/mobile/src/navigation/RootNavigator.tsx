import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { colors } from "../theme";
import type { RootStackParamList } from "./types";
import { MainTabs } from "./MainTabs";
import { EventDetailScreen } from "../screens/EventDetailScreen";
import { CompanyScreen } from "../screens/CompanyScreen";
import { DrugScreen } from "../screens/DrugScreen";
import { TrialScreen } from "../screens/TrialScreen";
import { IpoScreen } from "../screens/IpoScreen";
import { InsightsScreen } from "../screens/InsightsScreen";
import { CalendarScreen } from "../screens/CalendarScreen";
import { MonitorsScreen } from "../screens/MonitorsScreen";
import { LibraryScreen } from "../screens/LibraryScreen";
import { SignInScreen, SignUpScreen } from "../screens/AuthScreens";
import { useAuth } from "../auth/AuthContext";
import { LoadingView, Screen } from "../components/Ui";

const Stack = createNativeStackNavigator<RootStackParamList>();

const screenOptions = {
  headerStyle: { backgroundColor: colors.navy },
  headerTintColor: colors.white,
  headerTitleStyle: { fontWeight: "700" as const },
};

export function RootNavigator() {
  const { user, initializing } = useAuth();

  if (initializing) {
    return (
      <Screen>
        <LoadingView label="Securing your session…" />
      </Screen>
    );
  }

  return (
    <Stack.Navigator key={user ? "authenticated" : "guest"} screenOptions={screenOptions}>
      {user ? (
        <>
          <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
          <Stack.Screen name="EventDetail" component={EventDetailScreen} options={{ title: "Event" }} />
          <Stack.Screen name="Company" component={CompanyScreen} options={{ title: "Company" }} />
          <Stack.Screen name="Drug" component={DrugScreen} options={{ title: "Drug" }} />
          <Stack.Screen name="Trial" component={TrialScreen} options={{ title: "Trial" }} />
          <Stack.Screen name="Ipo" component={IpoScreen} options={{ title: "Pharma IPOs" }} />
          <Stack.Screen name="Insights" component={InsightsScreen} options={{ title: "Intelligence" }} />
          <Stack.Screen name="Calendar" component={CalendarScreen} options={{ title: "Catalyst Calendar" }} />
          <Stack.Screen name="Monitors" component={MonitorsScreen} options={{ title: "Smart Monitors" }} />
          <Stack.Screen name="Library" component={LibraryScreen} options={{ title: "Research Library" }} />
        </>
      ) : (
        <>
          <Stack.Screen name="SignIn" component={SignInScreen} options={{ headerShown: false }} />
          <Stack.Screen name="SignUp" component={SignUpScreen} options={{ headerShown: false }} />
        </>
      )}
    </Stack.Navigator>
  );
}
