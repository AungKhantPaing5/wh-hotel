# WN Mobile v0.3 — React Native + Expo

Flutter ကို React Native + Expo / TypeScript ဖြင့် အစားထိုးထားပါတယ်။ Next.js Website၊ NestJS API၊ PostgreSQL နဲ့ Firebase project ကို ဆက်သုံးပါတယ်။ Flutter source အဟောင်းကို Git history (`df8309237a5f08d2741624e182fb2873d74f92f8`) မှ ပြန်ယူနိုင်ပါတယ်။

## ပါဝင်သောအပိုင်း

- Explore, native date picker, guest count, availability, room review
- Firebase native Google / Apple / Phone OTP / email-password login
- Phone account → email/password link + email verification prompt
- Email/social account → phone verification gate before booking
- Booking submission, server totals, booking history/status, expiration display
- Per-user/per-stay request keys in SecureStore, reused after uncertain responses
- Preview/live distinction; server errors are not replaced with fake success/data

**ဒီ migration က production launch မဟုတ်ပါ။** Real Firebase/SMS/Apple flow ကို physical devices မှာ စမ်းရန်၊ payment/admin modules နဲ့ store releases ကို အပြီးသတ်ရန် လိုပါသေးတယ်။ Online payment buttons သို့မဟုတ် fake payment success မပါပါ။ Password reset က Firebase email link ဖြစ်ပြီး SMS-based account recovery မဟုတ်ပါ။

## 1. Laptop / ဖုန်းပေါ် စမ်းရန်

Node.js 22.13+ သို့မဟုတ် 24 LTS နဲ့ Git ထည့်ထားပါ။ Root server dependencies နဲ့ mobile dependencies ကို သီးခြားထိန်းထားပါတယ်။

```bash
git clone https://github.com/AungKhantPaing5/wh-hotel.git
cd wh-hotel/apps/mobile
npm ci
cp .env.example .env
npm start
```

ပထမစမ်းရန် `.env` မှာ empty API URL နဲ့ auth false ထားပါ။ Expo Go နဲ့ QR scan လုပ်ရင် **sample room UI** ကိုပဲ စမ်းနိုင်ပါတယ်။ Installed Expo Go က ဒီ project ရဲ့ SDK 55 ကို support လုပ်ရပါမယ်။ မကိုက်ရင် development build သုံးပါ။

```bash
npm run typecheck
npm test
```

API browsing အတွက် `.env`:

```dotenv
EXPO_PUBLIC_API_URL=https://YOUR_DOMAIN/api
EXPO_PUBLIC_AUTH_ENABLED=false
```

Nginx → Next.js rewrite သုံးရင် `/api` ဖြစ်ပါတယ်။ NestJS ကို တိုက်ရိုက် expose လုပ်ထားရင် HTTPS origin + `/v1` သုံးပါ။ Config ပြောင်းပြီး Metro ကို restart လုပ်ပါ။

## 2. Login ချိတ်ရန် — Expo Go မရပါ

Native Firebase လိုတဲ့အတွက် **development build** လိုပါတယ်။ အောက်က public config files ကို Firebase project တူတူမှ download ယူပြီး `apps/mobile` ထဲထည့်ပါ။

| Platform | Firebase app identity | Local file |
|---|---|---|
| Android | `com.wnhotel.wh_mobile` | `google-services.json` |
| iOS | `com.whhotel.whMobile` | `GoogleService-Info.plist` |

```dotenv
WH_FIREBASE_NATIVE=true
EXPO_PUBLIC_AUTH_ENABLED=true
EXPO_PUBLIC_API_URL=https://YOUR_DOMAIN/api
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
GOOGLE_IOS_URL_SCHEME=com.googleusercontent.apps.YOUR_IOS_CLIENT_ID
# Apple on Android: configure Apple Service ID + registered HTTPS redirect URI.
EXPO_PUBLIC_APPLE_SERVICE_ID=YOUR_APPLE_SERVICE_ID
EXPO_PUBLIC_APPLE_REDIRECT_URI=https://YOUR_REGISTERED_CALLBACK
```

Firebase Console မှ Google / Apple / Phone / Email-Password providers enable လုပ်ပါ။ Backend service account နဲ့ Firebase project ID ကိုလည်း တူညီစွာချိတ်ထားရပါမယ်။

- Android signing SHA-1 / SHA-256 ကို Firebase မှာ register လုပ်ပြီး config ပြန် download ပါ။ Local debug၊ GitHub debug နဲ့ EAS release signing certificate မတူနိုင်ပါတယ်။
- iOS: Apple Developer Team / Sign in with Apple capability၊ APNs key၊ phone auth reCAPTCHA setup စစ်ပါ။
- Phone auth: Firebase test numbers အရင်သုံးပြီး SMS billing / region restrictions နဲ့ Myanmar delivery ကို physical device မှာစမ်းပါ။
- User email/phone ရှိပြီးသား အခြား account နဲ့ collision ဖြစ်ရင် error ပြပါမယ်။ Account auto-merge မလုပ်ပါ။
- Phone verification ပြီး account view မပြောင်းသေးရင် **Refresh verification status** ကိုနှိပ်ပါ။
- Public mobile config ကိုသာ app ထဲထည့်ပါ။ Firebase Admin JSON / payment secret / private key လုံးဝမထည့်ပါနှင့်။

Local native development:

```bash
# Android SDK / Java 17 လိုပါတယ်။
npm run android
# iOS: macOS + compatible Xcode + CocoaPods လိုပါတယ်။
npm run ios
```

Native dependencies/config ပြောင်းရင် app ကို rebuild လုပ်ပါ။ Metro reload တစ်ခုတည်းနဲ့ မလုံလောက်ပါ။

## 3. Laptop အားနည်းရင် EAS cloud build

```bash
cd wh-hotel/apps/mobile
npx eas-cli@16.28.0 login
npx eas-cli@16.28.0 init
```

ပေါ်လာတဲ့ project UUID ကို `.env` မှ `EAS_PROJECT_ID` နဲ့ GitHub Actions Variable `EAS_PROJECT_ID` ထဲထည့်ပါ။ Generated app config ကိုစစ်ပြီး Expo project identity ကို commit လုပ်ထားနိုင်ပါတယ်။

```bash
# ပထမဆုံး interactive run နဲ့ signing credentials setup လုပ်ပါ။
npx eas-cli@16.28.0 build --platform android --profile development
# iPhone development အတွက် registered devices / provisioning လိုပါတယ်။
npx eas-cli@16.28.0 device:create
npx eas-cli@16.28.0 build --platform ios --profile development
# ထုတ်ထားတဲ့ development app ကို install ပြီး Metro ချိတ်ရန်:
npx expo start --dev-client
```

EAS remote build အတွက် public env values တွေကို Expo project ရဲ့ environment မှာပါသတ်မှတ်ပါ။ Local `.env` ကို gitignore လုပ်ထားလို့ အလိုအလျောက် remote ပို့မယ်လို့ မယူဆပါနှင့်။ GitHub release workflow ကတော့ လိုအပ်တဲ့ public config ကို `.env.local` ထဲရေးပြီး upload လုပ်ပေးပါတယ်။ EAS plan/usage limits ကို Expo account မှာစစ်ပါ။

## 4. GitHub Actions CI/CD

### Every push → verify + preview native builds

`WN Expo Mobile`:

1. `npm ci`, TypeScript, domain/API tests, Expo dependency compatibility
2. Android / iOS JavaScript bundle export
3. Android standalone APK (test signing) (GitHub artifact: `WN-Expo-Android-Preview-APK`)
4. iOS simulator app (artifact: `WN-Expo-iOS-Simulator`)

ဒီ automatic preview build မှာ **auth ကိုပိတ်ထားပါတယ်**။ Variable `EXPO_PUBLIC_API_URL` ဖြည့်ရင် real rooms ကြည့်နိုင်ပါတယ်။ Google/Apple/SMS login အမှန်စမ်းဖို့ အောက်က configured EAS build ကိုသုံးပါ။ Testing signing ကို production update key လို့ မယူဆပါနှင့်။ preview APK အသစ်တင်ရာမှာ အဟောင်း uninstall လုပ်ဖို့ လိုနိုင်ပါတယ်။

iOS Simulator app ကို iPhone မှာ install လုပ်လို့မရပါ။ Signed device build / TestFlight အတွက် Apple Developer credentials လိုပါတယ်။ Preview artifacts ကို 14 days ထားပါတယ်။

### Configured signed builds

GitHub Settings → Secrets and variables → Actions:

**Secrets**:
- `EXPO_TOKEN` — Expo access token
- `EXPO_ANDROID_GOOGLE_SERVICES_JSON` — Firebase Android client JSON content
- `EXPO_IOS_GOOGLE_SERVICES_PLIST` — Firebase iOS client plist content

**Variables**:
- `EAS_PROJECT_ID`
- `EXPO_PUBLIC_API_URL`
- `WH_FIREBASE_NATIVE=true`, `EXPO_PUBLIC_AUTH_ENABLED=true`
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `GOOGLE_IOS_URL_SCHEME`
- `EXPO_PUBLIC_APPLE_SERVICE_ID`, `EXPO_PUBLIC_APPLE_REDIRECT_URI`

GitHub → Actions → **WN Expo Store Build** → Run workflow → platform/profile ရွေးပါ။ First interactive EAS build နဲ့ credentials setup အရင်ပြီးထားရပါမယ်။ Workflow က EAS build ပြီးတဲ့အထိစောင့်ပြီး build URL ပြပါတယ်။ Store ကို အလိုအလျောက် submit မလုပ်ပါ။

```bash
# Store binary build (live config + credentials first)
npx eas-cli@16.28.0 build --platform all --profile production
# Binary ကို စစ်ဆေးပြီးမှ respective store သို့ submit
npx eas-cli@16.28.0 submit --platform android --profile production
npx eas-cli@16.28.0 submit --platform ios --profile production
```

Play Console / App Store Connect metadata၊ privacy/account deletion pages၊ hotel policies နဲ့ review လိုပါသေးတယ်။

### Update behavior

- Room/price/availability: API refresh မှ ပြောင်းတယ်။ App rebuild မလိုပါ။
- Website/backend: existing `WN Deploy` workflow ကိုဆက်သုံးတယ်။ VPS secrets/config လိုတယ်။
- Mobile native code: new binary + store release လိုတယ်။
- `expo-updates` + fingerprint runtime config ထည့်ထားတယ်။ OTA publishing ကို **မဖွင့်ထားသေးပါ**။ Compatible JS/assets updates ကို staged channel/device testing ပြီးမှ enable လုပ်ပါ။ GitHub push တစ်ခုတည်းနဲ့ phone တိုင်း ချက်ချင်း update မဖြစ်ပါ။

## 5. ဘယ်ဖိုင်ပြင်မလဲ

| အကြောင်းအရာ | File |
|---|---|
| UI / tabs / room search / booking / account | `App.tsx` |
| Dates / money / models / sample data | `src/domain.ts` |
| HTTPS API / Firebase token / errors | `src/api.ts` |
| Preview auth switch | `src/auth.ts` |
| Native Firebase / Google / Apple / OTP | `src/nativeFirebase.ts` |
| App identity / native plugins | `app.config.ts` |
| EAS build profiles | `eas.json` |
| Public local environment | `.env` (not committed) |
| CI and signed build pipeline | `../../.github/workflows/mobile-*.yml` |

## Known limits / physical-device checklist

- Test Google/Apple/email/phone sign-in, phone linking, email verification, account collision and logout/login on both platforms.
- Test Android auto-verification + iOS APNs/reCAPTCHA and SMS resend behavior. Provider configuration alone is not proof of SMS delivery.
- Test booking request timeout/retry, user changes, sold-out race, approval/expiration against the deployed API.
- No live payment session/webhook/refund integration; no fake confirmation.
- No admin mobile editing, cancellation/check-in/out, photo uploads, localization or production push notifications.
- Visual room illustrations are placeholders, not real hotel photos.
- API tests mock HTTP; they do not prove a real reservation or a provider login succeeded.

Official documentation:
- https://docs.expo.dev/guides/using-firebase/
- https://rnfirebase.io/auth/usage
- https://rnfirebase.io/auth/phone-auth
- https://github.com/invertase/react-native-apple-authentication
- https://docs.expo.dev/build/building-on-ci/
- https://docs.expo.dev/eas-update/runtime-versions/

### Preview architecture

GitHub preview APK က ARM64 Android devices အတွက် ဖြစ်ပါတယ်။ iOS simulator artifact က Apple Silicon (ARM64) Mac simulator အတွက် ဖြစ်ပါတယ်။ Store build profiles က သက်ဆိုင်ရာ EAS platform defaults ကိုသုံးပါတယ်။ iOS Firebase wrappers ကို `forceStaticLinking` ဖြင့် static libraries အဖြစ် link လုပ်ပြီး React non-modular header conflict ကိုရှောင်ထားပါတယ်။


For runtime private-server testing in the preview APK and Vultr SSH forwarding, see [the updated final-test guide](../../docs/FINAL-TEST.md#wn-update-app-testing-on-vultr--photo-uploads). Native package IDs are preserved for compatibility; the display name is WN Hotel.

## WN 0.4 native customer experience

The app has its own login/signup/reset forms, account contact completion, native date pickers, photo gallery, room-number displays, booking review sheet and booking history. No hotel website or WebView is opened for these flows. The same PostgreSQL-backed API is used by both clients. Phone contact is stored by `PATCH /me/contact`; it must start with 09 and contain exactly 11 digits. The app does not ask for SMS OTP.

The My bookings screen refreshes while open and supports pull-to-refresh. Booking status and final amounts always come from the API. Payments remain unavailable until a real payment provider is integrated. OAuth may use the provider's own system sign-in dialog; password-reset and verification messages are delivered by email.

### Live Android Firebase APK

The auth-disabled preview APK is not a working live authentication build. Use `.github/workflows/android-live.yml` for the standalone Android Firebase build:

1. In Firebase project `hotelbooking-d9229`, register an Android app with package `com.wnhotel.wh_mobile`.
2. Download the **Android client** `google-services.json`. Do not use a Firebase Admin/service-account key.
3. Add its complete contents to the repository Actions secret `EXPO_ANDROID_GOOGLE_SERVICES_JSON`.
4. Set the Actions variable `EXPO_PUBLIC_API_URL` to `https://thai1.payapi.uk/api` (this is also the workflow fallback).
5. For Google sign-in, set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` or include a type-3 OAuth client in the downloaded Android config. Add the signingReport SHA-1/SHA-256 to the Firebase Android app, then download updated config and rebuild. Email/password authentication does not depend on the Google OAuth client ID.
6. Run **WN Android Live Firebase** under GitHub Actions. Download `WN-Android-Live-Firebase-APK` when it succeeds. This is a standalone, test-signed ARM64 APK for sideload testing, not a Play Store release.

If the client configuration secret is missing, the workflow reports that the live APK was not built. It never silently substitutes an auth-disabled preview. Apple on Android additionally needs the Apple Service ID and redirect URI configured in the existing native adapter.

Real device sign-in and booking tests must be completed after the actual Android Firebase configuration is supplied. Mobile unit tests and bundle export validate the implementation but do not establish real Firebase sign-in or inbox delivery.

The supplied Firebase Android client configuration is included in `firebase/android-client.json`. It is public client configuration embedded in the APK, not a Firebase Admin/service-account credential. The live Android workflow prefers `EXPO_ANDROID_GOOGLE_SERVICES_JSON` when supplied, otherwise uses that file. The APK artifact also includes signing fingerprints for registering this test build with Firebase Google sign-in.
