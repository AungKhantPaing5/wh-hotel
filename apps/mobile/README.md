# WH Mobile v0.2 — Android / iOS

WH Hotel အတွက် Flutter app ဖြစ်ပါတယ်။ Website နဲ့ API/Firebase project တူတူသုံးပါတယ်။

## ပါဝင်ပြီးသော screens

- Explore: အခန်းအမျိုးအစား၊ amenities၊ price၊ dates/guests ရွေးချယ်မှု
- Availability search နှင့် sold-out/capacity handling
- Room details နှင့် booking review
- Google/Apple login၊ phone OTP signup/linking၊ email/password login/signup/reset
- Profile: phone verification gate၊ email verification prompt၊ sign out
- Booking request submission၊ server total၊ booking reference၊ status/history refresh
- Network errors/retry၊ request idempotency key၊ preview/live mode ခွဲပြခြင်း

Live payment gateway မချိတ်ရသေးပါ။ Payment pending screen က payment enabled ဖြစ်သလို မပြပါ။

## 1. APK ကို အရင်စမ်းမယ်

GitHub → Actions → WH Mobile → နောက်ဆုံး successful run → Artifacts → **WH-Android-APK** ကို download လုပ်ပါ။ ZIP ဖြည်ရင် `app-debug.apk` ရပါမယ်။ ဒါက developer-signed testing build ဖြစ်ပြီး Play Store production release မဟုတ်ပါ။ Android 7.0/API 24+ အတွက် build ထုတ်ပါတယ်။

Firebase/API config မဖြည့်ထားရင် APK က **Preview mode** နဲ့ဖွင့်ပါတယ်။ Sample rooms၊ room details နဲ့ booking review ကို စမ်းနိုင်ပေမယ့် login/booking submit ကို ပိတ်ထားပါတယ်။ Server error ဖြစ်လို့ sample data ကို အလိုအလျောက်အစားထိုးပြတာ မရှိပါ။

## 2. Source မှ run မယ်

Flutter SDK **3.41.7**, Android Studio/SDK နဲ့ Java 17 တင်ထားပါ။ iOS အတွက် macOS + Xcode လိုပါတယ်။

```bash
git clone https://github.com/AungKhantPaing5/wh-hotel.git
cd wh-hotel
bash scripts/init-mobile.sh
cd apps/mobile
flutter analyze
flutter test
flutter run
```

Native Android/iOS project files နဲ့ `pubspec.lock` ကို repository ထဲ ထည့်ထားပါတယ်။ `init-mobile.sh` က native platform files မရှိသေးရင် create လုပ်ပေးပြီး ရှိပြီးသား Dart source တွေကို ထိန်းထားပါတယ်။ နောက်တစ်ကြိမ် run တာက native defaults/configuration ကိုပဲ apply လုပ်ပါတယ်။

## 3. Live API / Firebase ချိတ်မယ်

API ကို HTTPS ဖြင့် အရင် deploy လုပ်ထားရပါမယ်။

```bash
cd apps/mobile
cp config/android.example.json config/live.android.json
```

`config/live.android.json` ပြင်ပါ:

```json
{
  "API_BASE_URL": "https://YOUR_DOMAIN/api",
  "FIREBASE_API_KEY": "Firebase Android client API key",
  "FIREBASE_APP_ID": "Firebase Android app ID",
  "FIREBASE_PROJECT_ID": "same project as backend",
  "FIREBASE_MESSAGING_SENDER_ID": "Firebase project number",
  "GOOGLE_SERVER_CLIENT_ID": "Web OAuth client ID ending .apps.googleusercontent.com",
  "GOOGLE_IOS_CLIENT_ID": ""
}
```

ဒီ Firebase client config က app ထဲမှာပါမယ့် public configuration ဖြစ်ပါတယ်။ **Firebase Admin SDK JSON၊ service account/private key၊ payment secret ကို app/config ထဲ မထည့်ပါနှင့်။**

```bash
flutter run --dart-define-from-file=config/live.android.json
flutter build apk --debug --dart-define-from-file=config/live.android.json
```

API URL တစ်ခုပဲဖြည့်ထားရင် live room browsing ရပါတယ်။ Firebase config မပါရင် sign-in ပိတ်ထားပါတယ်။

## 4. Firebase Console မှာ လုပ်ရန်

1. Backend သုံးထားတဲ့ Firebase project ထဲ Android app register လုပ်ပါ။ Package: `com.whhotel.wh_mobile`။ Native project ရဲ့ applicationId ကို နောက်ဆုံးအတည်ပြုပါ။
2. Google, Apple, Phone, Email/Password providers ကို enable လုပ်ပါ။
3. Signing certificate SHA-1 နဲ့ SHA-256 ထည့်ပါ။ Local debug certificate နဲ့ GitHub runner debug certificate မတူနိုင်ပါတယ်။ Testing ကို fixed test keystore သို့မဟုတ် သတ်မှတ်ထားတဲ့ release signing key နဲ့လုပ်သင့်ပါတယ်။
4. Google server client ID က **Web OAuth client ID** ဖြစ်ရပါမယ်။ Android client ID ကို serverClientId နေရာမှာ မသုံးပါနှင့်။
5. Phone auth အတွက် test numbers အရင်ထည့်ပြီး SMS billing/region policy/Play Integrity/reCAPTCHA setup ကိုစစ်ပါ။ SMS delivery ကို Myanmar operator တွေနဲ့စမ်းရပါမယ်။
6. Backend server မှာ Firebase Admin credential နဲ့ project ID ချိတ်ထားရပါမယ်။ App က verified ID token ကိုပဲ ပို့ပါတယ်။

Google/Apple/Phone login source ပါဝင်ပေမယ့် ကိုယ့် Firebase/Apple project နဲ့ end-to-end စမ်းပြီးမှ production ဖွင့်ပါ။ Account collision ဖြစ်ရင် credential error ပြပြီး account တွေကို အလိုအလျောက် မပေါင်းပါ။

## 5. iOS

Native template bundle ID က `com.whhotel.whMobile` ဖြစ်ပါတယ်။ Xcode → Runner မှ bundle ID/Team ကို ကိုယ့် Apple account နဲ့ အတည်ပြုပါ။ မိမိပြင်ထားရင် `lib/main.dart` မှ FirebaseOptions.iosBundleId ကိုလည်း ပြင်ပါ။

- Firebase မှ iOS app register လုပ်ပြီး iOS client API key/app ID ကို သီးခြား `config/live.ios.json` ထဲထည့်ပါ။
- `GOOGLE_IOS_CLIENT_ID` ဖြည့်ပါ။
- Reversed iOS client ID ကို URL scheme အဖြစ်ထည့်ရန်:

```bash
GOOGLE_IOS_REVERSED_CLIENT_ID=com.googleusercontent.apps.YOUR_ID bash scripts/init-mobile.sh
```

- Xcode မှ **Sign in with Apple** capability ဖွင့်ပါ။
- Phone auth အတွက် APNs key၊ Push Notifications၊ Background remote notifications နဲ့ reCAPTCHA URL scheme တို့ကို Firebase official setup အတိုင်းဖြည့်ပါ။
- iOS deployment target 15.0 သတ်မှတ်ထားပါတယ်။

```bash
cd apps/mobile
flutter build ios --release --no-codesign --dart-define-from-file=config/live.ios.json
```

CI မှထုတ်တဲ့ unsigned `.app` ကို iPhone မှာတိုက်ရိုက် install မရပါ။ Signed IPA/TestFlight/App Store အတွက် Apple Developer account၊ signing certificate/provisioning နဲ့ store metadata/review လိုပါတယ်။ Account deletion, privacy/support pages နဲ့ hotel policies တို့ကို public store launch မတိုင်မီ ထည့်ပြီး review လုပ်ပါ။

## 6. GitHub push နဲ့ App build

Source push/main ပြောင်းတာနဲ့ **WH Mobile** workflow က analyze/tests လုပ်ပြီး Android debug APK နဲ့ unsigned iOS build ထုတ်ပါတယ်။

GitHub → Settings → Secrets and variables → Actions → Variables မှ:

- Android live config: `MOBILE_ANDROID_CONFIG_JSON` မှာ အပေါ်က public client JSON ထည့်နိုင်ပါတယ်။
- iOS live config ကို `MOBILE_IOS_CONFIG_JSON` မှာ သီးခြားထည့်ပါ။ Android app ID ကို iOS build မှာ မသုံးပါနှင့်။
- `GOOGLE_IOS_REVERSED_CLIENT_ID` က iOS OAuth public URL scheme ဖြစ်ပါတယ်။

မဖြည့်ထားရင် Preview APK ထွက်ပါတယ်။ `workflow_dispatch` နဲ့ manual build လည်းရပါတယ်။ Artifacts က APK 30 days၊ iOS 14 days အထိထားပါတယ်။

Production signed release pipeline မဖွင့်ထားပါ။ App code update ကို phone ပေါ်အလိုအလျောက်အစားထိုးဖို့ Store release လိုပြီး room/pricing data updates ကိုတော့ API မှတစ်ဆင့် ရနိုင်ပါတယ်။

## 7. ဘယ်ဖိုင်ပြင်မလဲ

| ပြင်လိုသည့်အရာ | ဖိုင် |
|---|---|
| App theme, navigation | `lib/main.dart` |
| Branding colors / room illustrations | `lib/widgets.dart` |
| Room list, dates, guests, details | `lib/screens/home.dart` |
| Booking review / request | `lib/screens/review.dart` |
| Booking history / payment status | `lib/screens/bookings.dart` |
| Login / phone / email profile | `lib/screens/account.dart` |
| Firebase account operations | `lib/auth.dart` |
| API calls / token / errors | `lib/api.dart` |
| Data models / dates / money | `lib/models.dart` |
| Client configuration | `config/live.android.json` (gitignored) |
| Build workflow | `../../.github/workflows/mobile-build.yml` |

## Known limits

- Physical Android/iOS login and SMS tests require the owner's real Firebase/Apple configuration.
- Requests hold inventory for 30 minutes pending approval; accepted requests expire in 10 minutes without payment, matching the current backend.
- A saved retry key reduces duplicate submission risk. Always check My bookings after an uncertain request; local preferences are not a financial transaction log.
- No photo upload, admin editing, refund, check-in/out or cancellation UI in this mobile version.
- Room prices are base-rate estimates until the server creates the request; no hidden client-side payment success.
- English UI in this version; Myanmar localization can be added separately.

Official references:
- https://firebase.google.com/docs/auth/flutter/federated-auth
- https://firebase.google.com/docs/auth/flutter/phone-auth
- https://firebase.google.com/docs/auth/flutter/account-linking
- https://docs.flutter.dev/deployment/android
- https://docs.flutter.dev/deployment/ios
