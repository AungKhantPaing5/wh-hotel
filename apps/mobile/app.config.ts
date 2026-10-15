import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  const nativeFirebase = process.env.WH_FIREBASE_NATIVE === "true";
  if (process.env.EXPO_PUBLIC_AUTH_ENABLED === "true" && !nativeFirebase) {
    throw new Error(
      "Auth requires WH_FIREBASE_NATIVE=true and both Firebase platform config files.",
    );
  }
  const projectId = process.env.EAS_PROJECT_ID;
  return {
    ...config,
    name: "WH Hotel",
    slug: "wh-hotel",
    version: "0.3.0",
    scheme: "whhotel",
    orientation: "portrait",
    userInterfaceStyle: "light",
    ios: {
      bundleIdentifier: "com.whhotel.whMobile",
      supportsTablet: true,
      entitlements: { "com.apple.developer.applesignin": ["Default"] },
      ...(nativeFirebase
        ? {
            googleServicesFile:
              process.env.GOOGLE_SERVICES_PLIST || "./GoogleService-Info.plist",
          }
        : {}),
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        ...(process.env.EXPO_PUBLIC_LOCAL_TEST === "true"
          ? {
              NSAppTransportSecurity: { NSAllowsArbitraryLoads: true },
              NSLocalNetworkUsageDescription:
                "Connect to your disposable WH local test server.",
            }
          : {}),
      },
    },
    android: {
      package: "com.whhotel.wh_mobile",
      ...(nativeFirebase
        ? {
            googleServicesFile:
              process.env.GOOGLE_SERVICES_JSON || "./google-services.json",
          }
        : {}),
    },
    plugins: [
      "expo-dev-client",
      "expo-secure-store",
      "./plugins/withFirebaseStatic.cjs",
      [
        "expo-build-properties",
        {
          android: {
            usesCleartextTraffic: process.env.EXPO_PUBLIC_LOCAL_TEST === "true",
          },
          ios: {
            useFrameworks: "static",
            forceStaticLinking: ["RNFBApp", "RNFBAuth"],
          },
        },
      ],
      ...(nativeFirebase
        ? ([
            "@react-native-firebase/app",
            "@react-native-firebase/auth",
            [
              "@react-native-google-signin/google-signin",
              {
                ...(process.env.GOOGLE_IOS_URL_SCHEME
                  ? { iosUrlScheme: process.env.GOOGLE_IOS_URL_SCHEME }
                  : {}),
              },
            ],
          ] as NonNullable<ExpoConfig["plugins"]>)
        : []),
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
