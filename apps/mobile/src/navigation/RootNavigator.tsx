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
import { SignInScreen, SignUpScreen } from "../screens/AuthScreens";

const Stack = createNativeStackNavigator<RootStackParamList>();

const screenOptions = {
  headerStyle: { backgroundColor: colors.navy },
  headerTintColor: colors.white,
  headerTitleStyle: { fontWeight: "700" as const },
};

export function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen name="EventDetail" component={EventDetailScreen} options={{ title: "Event" }} />
      <Stack.Screen name="Company" component={CompanyScreen} options={{ title: "Company" }} />
      <Stack.Screen name="Drug" component={DrugScreen} options={{ title: "Drug" }} />
      <Stack.Screen name="Trial" component={TrialScreen} options={{ title: "Trial" }} />
      <Stack.Screen name="Ipo" component={IpoScreen} options={{ title: "Pharma IPOs" }} />
      <Stack.Screen
        name="SignIn"
        component={SignInScreen}
        options={{ title: "Sign in", presentation: "modal" }}
      />
      <Stack.Screen
        name="SignUp"
        component={SignUpScreen}
        options={{ title: "Create account", presentation: "modal" }}
      />
    </Stack.Navigator>
  );
}
