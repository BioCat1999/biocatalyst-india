const { withAppBuildGradle } = require("expo/config-plugins");

const DEBUG_SIGNING_BLOCK = `signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }`;

const RELEASE_SIGNING_BLOCK = `signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            def uploadStoreFile = findProperty('BIOCATALYST_UPLOAD_STORE_FILE')
            def uploadKeyAlias = findProperty('BIOCATALYST_UPLOAD_KEY_ALIAS')
            def uploadStorePassword = findProperty('BIOCATALYST_UPLOAD_STORE_PASSWORD')
            def uploadKeyPassword = findProperty('BIOCATALYST_UPLOAD_KEY_PASSWORD')

            if (!uploadStoreFile || !uploadKeyAlias || !uploadStorePassword || !uploadKeyPassword) {
                throw new GradleException('Missing Biocatalyst Android upload-signing properties. See docs/store/build.md.')
            }

            storeFile file(uploadStoreFile)
            storePassword uploadStorePassword
            keyAlias uploadKeyAlias
            keyPassword uploadKeyPassword
        }
    }`;

function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== "groovy") {
      throw new Error("Biocatalyst release signing requires a Groovy app/build.gradle file.");
    }

    let contents = gradleConfig.modResults.contents;
    if (!contents.includes("BIOCATALYST_UPLOAD_STORE_FILE")) {
      if (!contents.includes(DEBUG_SIGNING_BLOCK)) {
        throw new Error("Could not locate the Expo Android debug signing block.");
      }
      contents = contents.replace(DEBUG_SIGNING_BLOCK, RELEASE_SIGNING_BLOCK);
    }

    contents = contents.replace(
      /release \{\n\s*\/\/ Caution![\s\S]*?signingConfig signingConfigs\.debug/,
      "release {\n            signingConfig signingConfigs.release",
    );

    gradleConfig.modResults.contents = contents;
    return gradleConfig;
  });
}

module.exports = withAndroidReleaseSigning;
