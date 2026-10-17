# Android Play release build — Biocatalyst India

The current Play release uses Expo SDK 54, React Native 0.81, Android package
`india.biocatalyst.app`, version `1.0.3`, version code `4`, minimum SDK 24,
and target/compile SDK 36.

## Native generation

The native directories are generated and not treated as source. Recreate the
Android project from `apps/mobile` whenever Expo configuration changes:

```sh
EXPO_PUBLIC_API_URL=https://biocatalyst-india.vercel.app \
EXPO_TELEMETRY_DISABLED=1 NODE_ENV=production \
node node_modules/expo/bin/cli prebuild --clean --platform android --no-install
```

The local config plugin `plugins/withAndroidReleaseSigning.js` replaces the
Expo template's debug-key release signing with a required upload-key config.
Do not hand-edit generated `android/app/build.gradle`.

## Upload key

The release upload key is stored outside the repository at
`~/android-keys/biocatalyst-play-upload-2026.p12`; its protected local
password file is the mode-0600 sibling
`biocatalyst-play-upload-2026.password`. The alias is
`biocatalyst-upload`. Neither secret file is committed.

Back up the key and password to at least two independent secure locations.
Enable Play App Signing so Google protects the distribution key and the local
key remains only the upload key.

## Build

Use JDK 17 and Android SDK 36:

```sh
cd apps/mobile/android
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export ANDROID_HOME="$HOME/Library/Android/sdk"
export EXPO_PUBLIC_API_URL=https://biocatalyst-india.vercel.app
export EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
export EXPO_TELEMETRY_DISABLED=1 NODE_ENV=production
UPLOAD_PASSWORD="$(tr -d '\\n' < "$HOME/android-keys/biocatalyst-play-upload-2026.password")"
./gradlew bundleRelease --no-daemon \
  -PBIOCATALYST_UPLOAD_STORE_FILE="$HOME/android-keys/biocatalyst-play-upload-2026.p12" \
  -PBIOCATALYST_UPLOAD_KEY_ALIAS=biocatalyst-upload \
  -PBIOCATALYST_UPLOAD_STORE_PASSWORD="$UPLOAD_PASSWORD" \
  -PBIOCATALYST_UPLOAD_KEY_PASSWORD="$UPLOAD_PASSWORD"
unset UPLOAD_PASSWORD
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`.

## Verification

Before upload, verify the JAR signature, validate with the current official
Bundletool, and dump the manifest. Confirm package, version code/name, target
SDK 36, and the permission inventory in `permissions.md`. Each future Play
upload must have a strictly larger `android.versionCode`, even for an internal
test that is later discarded.

The API URL is baked into the JavaScript bundle. Production builds must use
the HTTPS origin above. The app also has that origin as its safe fallback, so
a missing environment variable cannot create a localhost production build.
