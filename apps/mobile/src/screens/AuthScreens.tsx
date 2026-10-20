/**
 * Mandatory sign in / sign up screens. Authentication uses the app's
 * email/password accounts; any valid email address (including Gmail)
 * can be used. AuthContext switches the root navigator after success.
 */
import React, { useEffect, useState } from "react";
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
import {
  GoogleSignin,
  GoogleSigninButton,
  isSuccessResponse,
  statusCodes,
  isErrorWithCode,
} from "@react-native-google-signin/google-signin";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../auth/AuthContext";
import { API_URL } from "../api";
import type { RootStackParamList } from "../navigation/types";
import { Screen } from "../components/Ui";
import { colors, fontSize, radius, spacing } from "../theme";

type SignInProps = NativeStackScreenProps<RootStackParamList, "SignIn">;
type SignUpProps = NativeStackScreenProps<RootStackParamList, "SignUp">;

const BUILD_GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();

function AuthForm({
  mode,
  onSubmit,
  onSwitch,
}: {
  mode: "signin" | "signup";
  onSubmit: (email: string, password: string) => Promise<void>;
  onSwitch: () => void;
}) {
  const { busy, error, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [googleClientId, setGoogleClientId] = useState<string | undefined>(
    BUILD_GOOGLE_WEB_CLIENT_ID,
  );

  useEffect(() => {
    let active = true;
    const configure = (webClientId: string) => {
      GoogleSignin.configure({ webClientId, offlineAccess: false });
      if (active) setGoogleClientId(webClientId);
    };
    if (BUILD_GOOGLE_WEB_CLIENT_ID) {
      configure(BUILD_GOOGLE_WEB_CLIENT_ID);
      return () => { active = false; };
    }
    fetch(`${API_URL}/api/v1/auth/config`)
      .then((response) => {
        if (!response.ok) throw new Error("auth config unavailable");
        return response.json() as Promise<{ googleClientId?: string }>;
      })
      .then(({ googleClientId: value }) => {
        if (value) configure(value);
      })
      .catch(() => {
        // Email/password remains available if Google configuration is offline.
      });
    return () => { active = false; };
  }, []);

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

  const continueWithGoogle = async () => {
    setLocalError(null);
    if (!googleClientId) {
      setLocalError("Google sign-in is still loading. Please try again shortly.");
      return;
    }
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) return;
      if (!response.data.idToken) {
        setLocalError("Google did not return a secure identity token. Please try again.");
        return;
      }
      await signInWithGoogle(response.data.idToken);
    } catch (err) {
      if (isErrorWithCode(err) && err.code === statusCodes.IN_PROGRESS) return;
      if (isErrorWithCode(err) && err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        setLocalError("Google Play Services needs to be installed or updated.");
        return;
      }
      setLocalError("Google sign-in could not be completed. Please try again.");
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.page}>
      <View style={styles.brandPanel}>
        <View style={styles.logoMark}>
          <Text style={styles.logoText}>BI</Text>
        </View>
        <Text style={styles.brand}>BIOCATALYST INDIA</Text>
        <Text style={styles.tagline}>Biopharma intelligence, distilled.</Text>
      </View>
      <View style={styles.sheet}>
        <Text style={styles.eyebrow}>{mode === "signin" ? "MEMBER ACCESS" : "GET STARTED"}</Text>
        <Text style={styles.title}>{mode === "signin" ? "Welcome back" : "Create your account"}</Text>
        <Text style={styles.subtitle}>
          {mode === "signin"
            ? "Sign in to access the catalyst feed, watchlists and alerts."
            : "Use any email address, including Gmail, to access the app."}
        </Text>
        <GoogleSigninButton
          size={GoogleSigninButton.Size.Wide}
          color={GoogleSigninButton.Color.Light}
          onPress={continueWithGoogle}
          disabled={busy || !googleClientId}
          style={styles.googleButton}
        />
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR USE EMAIL</Text>
          <View style={styles.dividerLine} />
        </View>
        <Text style={styles.label}>Email address</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType={mode === "signin" ? "username" : "emailAddress"}
          placeholder="you@example.com"
          placeholderTextColor={colors.placeholder}
          style={styles.input}
          accessibilityLabel="Email address"
        />
        <Text style={styles.label}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          textContentType={mode === "signin" ? "password" : "newPassword"}
          placeholder={mode === "signin" ? "Enter your password" : "Create a secure password"}
          placeholderTextColor={colors.placeholder}
          style={styles.input}
          accessibilityLabel="Password"
        />
        {(localError || error) && (
          <View style={styles.errorBox}>
            <Text style={styles.error}>{localError ?? error}</Text>
          </View>
        )}
        <Pressable
          onPress={submit}
          disabled={busy}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.button,
            busy && styles.buttonDisabled,
            pressed && !busy && styles.buttonPressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.buttonText}>{mode === "signin" ? "Sign in securely" : "Create account"}</Text>
          )}
        </Pressable>
        <Pressable onPress={onSwitch} style={styles.switchRow} accessibilityRole="button">
          <Text style={styles.switchMuted}>{mode === "signin" ? "New to Biocatalyst? " : "Already have an account? "}</Text>
          <Text style={styles.switchText}>{mode === "signin" ? "Create account" : "Sign in"}</Text>
        </Pressable>
        <Text style={styles.privacy}>Your credentials are encrypted in transit and your session is stored securely on this device.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

export function SignInScreen({ navigation }: SignInProps) {
  const { signIn } = useAuth();
  return (
    <Screen>
      <AuthForm
        mode="signin"
        onSubmit={signIn}
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
        onSubmit={signUp}
        onSwitch={() => navigation.replace("SignIn")}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.navy, justifyContent: "flex-end" },
  brandPanel: { flex: 1, minHeight: 210, alignItems: "center", justifyContent: "center", paddingTop: spacing.xl },
  logoMark: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.tealBright,
    marginBottom: spacing.md,
  },
  logoText: { color: colors.white, fontSize: fontSize.xl, fontWeight: "800", letterSpacing: -0.5 },
  brand: { color: colors.white, fontSize: fontSize.lg, fontWeight: "800", letterSpacing: 2 },
  tagline: { color: colors.navyText, fontSize: fontSize.sm, marginTop: spacing.xs },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: 32,
  },
  eyebrow: { color: colors.teal, fontSize: fontSize.xs, fontWeight: "800", letterSpacing: 1.4 },
  title: { fontSize: 28, fontWeight: "800", color: colors.navy, marginTop: spacing.xs, letterSpacing: -0.5 },
  subtitle: { fontSize: fontSize.md, color: colors.muted, marginTop: spacing.sm, marginBottom: spacing.md, lineHeight: 22 },
  label: { fontSize: fontSize.sm, fontWeight: "700", color: colors.ink, marginTop: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius + 2,
    backgroundColor: colors.inputBg,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: fontSize.md,
    color: colors.ink,
    marginTop: spacing.sm,
  },
  errorBox: { backgroundColor: colors.redSoft, borderRadius: radius, padding: spacing.md, marginTop: spacing.md },
  error: { color: colors.red, fontSize: fontSize.sm, lineHeight: 19 },
  googleButton: {
    width: "100%",
    height: 52,
    marginTop: spacing.sm,
  },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.lg },
  dividerLine: { height: 1, backgroundColor: colors.line, flex: 1 },
  dividerText: { color: colors.placeholder, fontSize: 10, fontWeight: "700", letterSpacing: 0.8 },
  button: {
    backgroundColor: colors.navy,
    borderRadius: radius + 2,
    minHeight: 52,
    justifyContent: "center",
    paddingVertical: 14,
    alignItems: "center",
    marginTop: spacing.xl,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonPressed: { opacity: 0.9, transform: [{ scale: 0.995 }] },
  buttonText: { color: colors.white, fontWeight: "800", fontSize: fontSize.md },
  switchRow: { marginTop: spacing.lg, justifyContent: "center", flexDirection: "row" },
  switchMuted: { color: colors.muted, fontSize: fontSize.sm },
  switchText: { color: colors.teal, fontWeight: "700", fontSize: fontSize.sm },
  privacy: { color: colors.placeholder, textAlign: "center", fontSize: 11, lineHeight: 16, marginTop: spacing.lg },
});
