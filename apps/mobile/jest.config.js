module.exports = {
  preset: "jest-expo",
  // pnpm lays packages out under node_modules/.pnpm/<pkg>/node_modules/<pkg>,
  // which the stock react-native transformIgnorePatterns does not match.
  // This variant transforms the same allow-list regardless of .pnpm nesting.
  transformIgnorePatterns: [
    "node_modules/(?!.*((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|react-native-svg|@testing-library))",
  ],
  testMatch: ["**/__tests__/**/*.test.[jt]s?(x)"],
};
