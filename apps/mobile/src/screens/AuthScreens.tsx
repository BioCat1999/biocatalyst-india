/**
 * Sign in / sign up screens. Same credential rules as web (local auth,
 * no third-party providers). On success the modal closes and the
 * session is live app-wide via AuthContext.
 */
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../auth/AuthContext";
import type { RootStackParamList } from "../navigation/types";
import { Screen } from "../components/Ui";
import { colors, fontSize, radius, spacing } from "../theme";

type SignInProps = NativeStackScreenProps<RootStackParamList, "SignIn">;
type SignUpProps = NativeStackScreenProps<RootStackParamList, "SignUp">;

function AuthForm({
  mode,
  onSubmit,
  onSwitch,
}: {
  mode: "signin" | "signup";
  onSubmit: (email: string, password: string) => Promise<void>;
  onSwitch: () => void;
}) {
  const { busy, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async () => {
    setLocalError(null);
    if (!email.trim() || !password) {
      setLocalError("Email and password are required.");
      return;
    }
    try {
      await onSubmit(email, password);
    } catch {
      // AuthContext already surfaced the server message.
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.form}
    >
      <Text style={styles.title}>{mode === "signin" ? "Welcome back" : "Create account"}</Text>
      <Text style={styles.subtitle}>
        {mode === "signin"
          ? "Sign in to manage your watchlist and alerts."
          : "One account for watchlist and alerts. Browsing stays anonymous."}
      </Text>
      <Text style={styles.label}>Email</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType={mode === "signin" ? "username" : "emailAddress"}
        style={styles.input}
        accessibilityLabel="Email"
      />
      <Text style={styles.label}>Password</Text>
      <TextInput
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
        style={styles.input}
        accessibilityLabel="Password"
      />
      {(localError || error) && <Text style={styles.error}>{localError ?? error}</Text>}
      <Pressable
        onPress={submit}
        disabled={busy}
        accessibilityRole="button"
        style={[styles.button, busy && styles.buttonDisabled]}
      >
        {busy ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.buttonText}>{mode === "signin" ? "Sign in" : "Sign up"}</Text>
        )}
      </Pressable>
      <Pressable onPress={onSwitch} style={styles.switchRow} accessibilityRole="button">
        <Text style={styles.switchText}>
          {mode === "signin" ? "New here? Create an account" : "Have an account? Sign in"}
        </Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

export function SignInScreen({ navigation }: SignInProps) {
  const { signIn } = useAuth();
  return (
    <Screen>
      <AuthForm
        mode="signin"
        onSubmit={async (email, password) => {
          await signIn(email, password);
          navigation.goBack();
        }}
        onSwitch={() => navigation.replace("SignUp")}
      />
    </Screen>
  );
}

export function SignUpScreen({ navigation }: SignUpProps) {
  const { signUp } = useAuth();
  return (
    <Screen>
      <AuthForm
        mode="signup"
        onSubmit={async (email, password) => {
          await signUp(email, password);
          navigation.goBack();
        }}
        onSwitch={() => navigation.replace("SignIn")}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { flex: 1, padding: spacing.xl },
  title: { fontSize: fontSize.title, fontWeight: "700", color: colors.navy },
  subtitle: { fontSize: fontSize.md, color: colors.muted, marginTop: spacing.sm, marginBottom: spacing.lg },
  label: { fontSize: fontSize.sm, fontWeight: "700", color: colors.muted, marginTop: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    color: colors.ink,
    marginTop: spacing.xs,
  },
  error: { color: colors.red, fontSize: fontSize.sm, marginTop: spacing.md },
  button: {
    backgroundColor: colors.teal,
    borderRadius: radius,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.lg,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.white, fontWeight: "700", fontSize: fontSize.md },
  switchRow: { marginTop: spacing.lg, alignItems: "center" },
  switchText: { color: colors.teal, fontWeight: "600", fontSize: fontSize.md },
});
