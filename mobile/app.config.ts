import type { ExpoConfig } from "expo/config";
import { metadata, backendOrigin } from "./scripts/android-release.cjs";
const release = metadata(require("./package.json").version);
if (process.env.ANDROID_RELEASE_BUILD === "true")
  backendOrigin(process.env.EXPO_PUBLIC_API_URL);
if (
  process.env.EAS_BUILD === "true" &&
  !process.env.EXPO_PUBLIC_API_URL?.startsWith("https://")
)
  throw Error(
    "Configure the real HTTPS EXPO_PUBLIC_API_URL in the selected EAS environment before building.",
  );
const config: ExpoConfig = {
  name: "Quant's Trade",
  slug: "quants-trade",
  version: release.version,
  scheme: "quantstrade",
  orientation: "portrait",
  userInterfaceStyle: "dark",
  icon: "./assets/icon.png",
  android: {
    package: "com.quantstrade.mobile",
    allowBackup: false,
    versionCode: release.versionCode,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#080D0E",
    },
    permissions: ["POST_NOTIFICATIONS", "USE_BIOMETRIC"],
    blockedPermissions: [
      "RECORD_AUDIO",
      "READ_EXTERNAL_STORAGE",
      "WRITE_EXTERNAL_STORAGE",
    ],
    ...(process.env.GOOGLE_SERVICES_JSON
      ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON }
      : {}),
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-local-authentication",
    [
      "expo-notifications",
      { icon: "./assets/notification.png", color: "#55DAB0" },
    ],
    [
      "expo-splash-screen",
      {
        backgroundColor: "#080D0E",
        image: "./assets/splash.png",
        imageWidth: 200,
      },
    ],
  ],
  experiments: { typedRoutes: true },
  web: { bundler: "metro" },
  extra: {
    ...(process.env.EXPO_PUBLIC_EAS_PROJECT_ID
      ? { eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID } }
      : {}),
  },
};
export default config;
