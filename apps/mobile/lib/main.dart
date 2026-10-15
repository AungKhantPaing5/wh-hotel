import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'api.dart';
import 'auth.dart';
import 'config.dart';
import 'screens/home.dart';
import 'screens/account.dart';
import 'screens/bookings.dart';
import 'widgets.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  bool enabled = false;
  String? error;
  if (!AppConfig.preview && AppConfig.hasFirebase) {
    try {
      await Firebase.initializeApp(
        options: const FirebaseOptions(
          apiKey: AppConfig.firebaseApiKey,
          appId: AppConfig.firebaseAppId,
          projectId: AppConfig.firebaseProjectId,
          messagingSenderId: AppConfig.firebaseSenderId,
          iosBundleId: 'com.whhotel.whMobile',
        ),
      );
      enabled = true;
    } catch (_) {
      error =
          'Firebase initialization failed. Check this platform’s app configuration.';
    }
  }
  final session = WhSession(enabled: enabled, initializationError: error);
  runApp(
    WhApp(
      session: session,
      api: WhApi(baseUrl: AppConfig.apiUrl, token: session.token),
    ),
  );
}

class WhApp extends StatelessWidget {
  final WhSession session;
  final WhApi api;
  const WhApp({super.key, required this.session, required this.api});
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'WH Hotel',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: paper,
      colorScheme: ColorScheme.fromSeed(
        seedColor: forest,
        primary: forest,
        surface: paper,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: paper,
        foregroundColor: forest,
        centerTitle: false,
      ),
      inputDecorationTheme: InputDecorationTheme(
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 16),
        ),
      ),
    ),
    home: WhShell(session: session, api: api),
  );
}

class WhShell extends StatefulWidget {
  final WhSession session;
  final WhApi api;
  const WhShell({super.key, required this.session, required this.api});
  @override
  State<WhShell> createState() => _WhShellState();
}

class _WhShellState extends State<WhShell> {
  int index = 0;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Row(
        children: [
          Text(
            'WH',
            style: TextStyle(
              fontFamily: 'serif',
              fontWeight: FontWeight.bold,
              fontSize: 30,
            ),
          ),
          SizedBox(width: 12),
          Text(
            'HOTEL & STAYS',
            style: TextStyle(fontSize: 11, letterSpacing: 2),
          ),
        ],
      ),
    ),
    body: SafeArea(
      child: IndexedStack(
        index: index,
        children: [
          HomePage(api: widget.api, session: widget.session),
          BookingsPage(
            api: widget.api,
            session: widget.session,
            active: index == 1,
            onAccount: () => setState(() => index = 2),
          ),
          AccountPage(api: widget.api, session: widget.session),
        ],
      ),
    ),
    bottomNavigationBar: NavigationBar(
      selectedIndex: index,
      onDestinationSelected: (i) => setState(() => index = i),
      destinations: const [
        NavigationDestination(
          icon: Icon(Icons.hotel_outlined),
          selectedIcon: Icon(Icons.hotel),
          label: 'Explore',
        ),
        NavigationDestination(
          icon: Icon(Icons.receipt_long_outlined),
          label: 'My bookings',
        ),
        NavigationDestination(
          icon: Icon(Icons.person_outline),
          label: 'Account',
        ),
      ],
    ),
  );
}
