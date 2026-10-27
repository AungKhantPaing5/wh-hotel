# WN Hotel mobile v0.5

React Native / Expo native Android and iOS customer application. Email/password authentication uses the WN API with SecureStore session storage. Firebase, Google, Apple and SMS dependencies/configuration were removed.

Set `EXPO_PUBLIC_API_URL=https://your-domain.com/api`. Run `npm ci`, `npm run typecheck`, `npm test`, then `npx expo run:android` / `npx expo run:ios`. Android CI creates a standalone ARM64 test-signed APK with the live API configured. Rebuild/install v0.5 when migrating the server from Firebase. Version 0.4 login is incompatible with the local-account backend.

Native flows: signup with required local phone, login, recovery email + code entry, password change, profile phone, room gallery/date picker, booking requests/history and Kitchen room-service ordering. Guests can browse the menu before check-in but the API accepts orders only during staff-recorded check-in. The app never sends hotel customer flows to a website. Password recovery email also contains an optional website recovery link.

For private-network testing only, set `EXPO_PUBLIC_LOCAL_TEST=true` and an allowed private HTTP API URL. Disposable account fixtures come from the API/PostgreSQL seed, without an auth emulator. The current preview/test build uses default Expo test signing. Store distribution and iPhone installation require platform signing credentials.

Food charges are separate from room payment. Real payment APIs remain disabled. See the root README for account migration, SMTP, permissions and deployment.
