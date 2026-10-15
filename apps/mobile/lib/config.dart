class AppConfig {
  static const apiUrl = String.fromEnvironment('API_BASE_URL');
  static const firebaseApiKey = String.fromEnvironment('FIREBASE_API_KEY');
  static const firebaseAppId = String.fromEnvironment('FIREBASE_APP_ID');
  static const firebaseProjectId = String.fromEnvironment('FIREBASE_PROJECT_ID');
  static const firebaseSenderId = String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID');
  static const googleServerClientId = String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID');
  static const googleIosClientId = String.fromEnvironment('GOOGLE_IOS_CLIENT_ID');
  static bool get preview => apiUrl.isEmpty;
  static bool get hasFirebase => [firebaseApiKey, firebaseAppId, firebaseProjectId, firebaseSenderId].every((v) => v.isNotEmpty);
}
