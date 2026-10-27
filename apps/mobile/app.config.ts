import type { ConfigContext, ExpoConfig } from "expo/config";
export default ({ config }: ConfigContext): ExpoConfig => {
  const projectId = process.env.EAS_PROJECT_ID;
  return {
    ...config,
    name: "WN Hotel",
    slug: "wh-hotel",
    version: "0.5.0",
    scheme: "whhotel",
    icon: "./assets/icon.png",
    orientation: "portrait",
    userInterfaceStyle: "light",
    ios: {
      bundleIdentifier: "com.whhotel.whMobile",
      supportsTablet: true,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        ...(process.env.EXPO_PUBLIC_LOCAL_TEST === "true"
          ? {
              NSAppTransportSecurity: { NSAllowsArbitraryLoads: true },
              NSLocalNetworkUsageDescription:
                "Connect to the private WN test server.",
            }
          : {}),
      },
    },
    android: {
      package: "com.wnhotel.wh_mobile",
      versionCode: 2,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#24483a",
      },
    },
    plugins: [
      "expo-dev-client",
      "expo-secure-store",
      [
        "expo-build-properties",
        {
          android: {
            usesCleartextTraffic: process.env.EXPO_PUBLIC_LOCAL_TEST === "true",
          },
        },
      ],
    ],
    extra: { ...(projectId ? { eas: { projectId } } : {}) },
    ...(projectId
      ? {
          updates: { url: `https://u.expo.dev/${projectId}` },
          runtimeVersion: { policy: "fingerprint" },
        }
      : { updates: { enabled: false } }),
  };
};
