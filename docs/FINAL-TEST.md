# WN — Local acceptance / final-test guide

ဒီ guide က account/domain/VPS မရှိသေးဘဲ **disposable local environment** မှာ စမ်းရန်ဖြစ်ပါတယ်။ Production-ready launch၊ real bank test၊ real SMS / Google / Apple login test အဖြစ် မယူဆပါနှင့်။

## 1. လိုအပ်ချက်

- Windows မှာ Docker Desktop + WSL integration သို့မဟုတ် Linux မှာ Docker Engine + Docker Compose v2
- Git၊ Internet (first dependency/image download အတွက်)
- Mobile source စမ်းရန် Node.js 22+၊ Expo SDK 55 compatible Expo Go / development build
- Website/backend/database containers အတွက် free RAM/disk လုံလောက်စွာထားပါ။ Native Android build ကို GitHub Actions မှ ထုတ်နိုင်ပါတယ်။

## 2. တစ်ကြိမ်တည်း start လုပ်ရန်

```bash
git clone https://github.com/AungKhantPaing5/wh-hotel.git
cd wh-hotel
docker compose -f compose.test.yml up -d --build
docker compose -f compose.test.yml ps -a
```

Existing clone ဆို `git pull --ff-only` ကို အရင်လုပ်ပါ။ `seed` နဲ့ `migrate` က Exited (0) ဖြစ်တာ ပုံမှန်ပါ။ `db`, `auth`, `api`, `web` က running ဖြစ်ရပါမယ်။ Test stack က production `compose.yml` နဲ့ သီးခြား project / volume သုံးပါတယ်။

Open:

- Customer: http://localhost:3000
- Admin: http://localhost:3000/admin
- Developer / configuration status: http://localhost:3000/developer

Every screen မှာ **LOCAL TEST ONLY** လို့ ပြပါတယ်။ Default bindings က local PC သီးသန့်ဖြစ်ပါတယ်။

## 3. Test accounts

အောက်က account တွေက local emulator မှာပဲ ရှိပါတယ်။ Firebase အစစ်၊ Google/Apple နဲ့ မဆိုင်ပါ။

| Role | Email | Password | Firebase UID |
|---|---|---|---|
| Owner | `admin@wh.test` | `WhTestOnly2026!` | `wh-test-admin` |
| Customer | `guest@wh.test` | `WhTestOnly2026!` | `wh-test-guest` |
| Staff | `staff@wh.test` | `WhTestOnly2026!` | `wh-test-staff` |
| Phone မရှိသော customer | `nophone@wh.test` | `WhTestOnly2026!` | `wh-test-no-phone` |

Staff က owner permission ပေးမထားသေးရင် dashboard access မရပါ။ Customer/admin/staff ကို browser profile သီးခြား သို့မဟုတ် incognito သီးခြားနဲ့ စမ်းပါ။ Same browser origin ရဲ့ tabs တွေမှာ Firebase session တူနိုင်ပါတယ်။

## 4. Manual acceptance scenario

1. Customer → My account → Email sign in ဖြင့် `guest@wh.test` ဝင်ပါ။
2. မနက်ဖြန်နောက်ပိုင်း check-in/check-out ရွေး၊ availability ရှာ၊ room တစ်ခု **Request stay** လုပ်ပါ။ `PENDING_APPROVAL` ဖြစ်ရမယ်။
3. Admin ကို သီးခြား browser/profile မှ owner account နဲ့ဝင်ပါ။ Booking tab → **accept** နှိပ်ပါ။ `AWAITING_PAYMENT` ဖြစ်ရမယ်။
4. Customer → My account ကို ပြန်ဖွင့်/Refresh profile လုပ်ပါ။ **Simulate payment — no money** နှိပ်ပါ။ `CONFIRMED` ဖြစ်ရမယ်။
5. Admin → Payments → provider `SIMULATED` နဲ့ transaction တစ်ခုသာ ရှိရမယ်။ ဘယ်ကတ်/ဘဏ်ကမှ ငွေမဖြတ်ပါ။
6. နောက် booking request တစ်ခုကို **reject** လုပ်ပြီး customer မှာ `REJECTED` ပြသတာစစ်ပါ။
7. Rooms → price / amenities ပြင်ပြီး Upload room photo မှ file ရွေးတင်ပါ။ Customer ကို reload လုပ်ရင် အသစ်ပြရမယ်။ ရှိပြီးသား booking total က မပြောင်းရပါ။
8. Physical room ကို **Take offline** လုပ်ပါ။ Availability လျော့ရမယ်။ Existing reservation က မပျက်ရပါ။ ပြန် **Make available** လုပ်ပါ။
9. Calendar → starting date ရွေးပြီး 14-day availability ကြည့်ပါ။
10. Staff → UID `wh-test-staff` ထည့်၊ `bookings.read`, `payments.read` ရွေး၊ Save လုပ်ပါ။ Staff account က bookings/payments ကြည့်နိုင်ပြီး room editing / approval / permission changes မလုပ်နိုင်ရပါ။
11. `bookings.manage` ပေးပြီး staff dashboard Refresh လုပ်ပါ။ Booking accept/reject လုပ်နိုင်ရမယ်။ Owner က **Revoke access** လုပ်လိုက်ရင် နောက် API request မှာ ခွင့်ပြုချက်ပျက်ရမယ်။
12. Developer page → owner ဝင်ထားတဲ့ browser မှ Check configuration။ `localTest: true`, `livePayments: false`, `paymentMode: SIMULATED_ONLY` ပြရမယ်။ Customer/staff ကို ဒီ API ခွင့်မပေးရပါ။
13. `nophone@wh.test` နဲ့ booking တင်ရင် phone verification error ပြရမယ်။ OTP flow ကို အောက်က emulator codes ဖြင့်စမ်းပါ။

### Test OTP / email links

Test SMS ကို phone အစစ်ဆီ မပို့ပါ။ Code ကြည့်ရန်:

```bash
docker compose -f compose.test.yml logs --tail=100 auth
# Or from the local PC:
curl http://127.0.0.1:9099/emulator/v1/projects/demo-wh-final/verificationCodes
# Verification / password-reset links:
curl http://127.0.0.1:9099/emulator/v1/projects/demo-wh-final/oobCodes
```

Phone ကို international format `+959...` နဲ့ထည့်၊ generated code ကို UI မှာပြန်ထည့်ပါ။ Test email verification/reset link ကို local browser မှာဖွင့်ပါ။ Auth service logs ထဲမှာ internal hostname `auth:9099` နဲ့ link ပြရင် local PC အတွက် `127.0.0.1:9099` ပြောင်းဖွင့်ပါ။

## 5. Automated acceptance test

**ဒီ test က seeded customer ရဲ့ local-test bookings ကို clear လုပ်ပါတယ်။ Manual test data ထိန်းချင်ရင် သီးခြား clone/test instance မှာ run ပါ။** Production environment မှာ မသုံးပါနှင့်။

```bash
docker compose -f compose.test.yml -f compose.acceptance.yml run --rm acceptance
```

Test coverage:

- Authentication / owner / staff authorization boundaries
- Verified-phone booking gate
- Room/rate editing, offline inventory and sold-out handling
- Same-key retry and changed-request rejection
- Server-owned booking price
- Owner approval / staff read-only rejection
- Simulated payment gating + duplicate payment prevention
- Booking rejection and staff access revocation
- Concurrent booking race through HTTP + real PostgreSQL constraint

Tests ပြီးရင် test guest bookings၊ changed room rates / physical availability နဲ့ staff permission fixture ကို cleanup/restore လုပ်ပါတယ်။ GitHub Actions **WN Local Acceptance** က disposable stack နဲ့ အလိုအလျောက် run ပေးပါတယ်။

## 6. Android / iOS App ကို local backend နဲ့စမ်းရန်

ဖုန်းနဲ့ PC ကို private Wi-Fi တူတူချိတ်ပါ။ PC ရဲ့ private IPv4 ကို `ipconfig` မှကြည့်ပါ။ Public VPS ပေါ်မှာ test emulator ကို expose မလုပ်ပါနှင့်။

Linux/WSL terminal:

```bash
WH_TEST_BIND=0.0.0.0 docker compose -f compose.test.yml up -d
cd apps/mobile
npm ci
cp .env.example .env
```

`.env` ကို ကိုယ့် PC IPv4 နဲ့ပြင်ပါ (ဥပမာသာ):

```dotenv
EXPO_PUBLIC_LOCAL_TEST=true
EXPO_PUBLIC_AUTH_ENABLED=false
WH_FIREBASE_NATIVE=false
EXPO_PUBLIC_API_URL=http://192.168.1.50:3000/api
EXPO_PUBLIC_TEST_AUTH_URL=http://192.168.1.50:9099
```

```bash
npm start
```

Expo Go / development app မှ QR scan လုပ်ပါ။ `guest@wh.test` နဲ့ email login → room/date → booking → history → admin approval → **Simulate payment** စမ်းနိုင်ပါတယ်။ Phone OTP / email links တွေက emulator-generated ပဲ ဖြစ်ပါတယ်။ Google/Apple providers ကို ဒီ adapter မှာ intentionally ပိတ်ထားပါတယ်။

- Android emulator က host PC ကို `10.0.2.2` ဖြင့်ချိတ်နိုင်ပါတယ်။ iOS simulator က Mac host ကို `127.0.0.1` သုံးနိုင်ပါတယ်။
- WSL2 NAT / Windows firewall ကြောင့် phone မချိတ်နိုင်ရင် Windows host ရဲ့ Docker Desktop WSL integration နဲ့ private-network port reachability ကိုစစ်ပါ။ `http://PC_IP:3000/api/health/ready` ကို phone browser မှာဖွင့်ကြည့်ပါ။
- လက်ရှိ GitHub preview APK မှာ private test server address ကို startup screen မှ ထည့်နိုင်ပါပြီ။ Vultr အတွက် အောက်ဆုံး WN update section ကိုလိုက်လုပ်ပါ။ Production Firebase credentials ကတော့ build-time config ဖြစ်ပါတယ်။
- Native local build လိုရင် Android SDK ရှိတဲ့ PC မှ `npm run android`; iOS အတွက် Mac/Xcode မှ `npm run ios` သုံးပါ။ Local test HTTP policy/config ပြောင်းရင် prebuild/rebuild လိုပါတယ်။

ပြီးရင် localhost-only ပြန်ထားရန်:

```bash
cd ../..
docker compose -f compose.test.yml up -d
```

## 7. Stop / reset

```bash
# Stop, preserve the test DB
docker compose -f compose.test.yml down
# Explicitly delete ONLY this disposable local-test DB
docker compose -f compose.test.yml down -v
```

Auth emulator accounts က ephemeral ဖြစ်ပါတယ်။ Restart ပြီး test users ပြန်မရှိရင်:

```bash
docker compose -f compose.test.yml run --rm seed
```

Production `compose.yml down -v` ကို ဒီ commands နဲ့ မရောပါနှင့်။

## 8. Production release မတိုင်မီ ကျန်သောအပိုင်း

| Test / requirement | လိုအပ်သော setup |
|---|---|
| Real Google / Phone / Email auth | Firebase project + provider configuration + SMS delivery testing |
| Real Apple login / signed iPhone build | Apple Developer account / capabilities / signing |
| Live cards / KBZPay / CB Pay | Approved merchant API accounts, actual integrations + verified webhooks/refunds/reconciliation |
| HTTPS website/API | VPS / domain / DNS / TLS / production environment |
| EAS cloud signed builds | Expo project/token + signing credentials |
| Store release | Play Console / App Store Connect + privacy/account deletion/policies/review |

အခု `SIMULATED` transaction သည် bank payment integration မဟုတ်ပါ။ Website/mobile test flow အောင်တာနဲ့ production payment အောင်တယ်လို့ မသတ်မှတ်ပါနှင့်။

Room photo file upload (JPEG/PNG/WebP) နဲ့ persistent server storage ပါပြီးသားဖြစ်ပါတယ်။ Staff permission management ပါပြီး production staff invitation/account deletion workflow မပါသေးပါ။ Refund/cancellation policies၊ notifications၊ advanced reports/accounting၊ full housekeeping/PMS၊ SMS-based account recovery နဲ့ monitoring/backup restore drills ကို ထပ်ပြီးအပြီးသတ်ရန်လိုပါတယ်။


## WN update: App testing on Vultr + photo uploads

Repository path, Docker project names, Firebase identifiers and existing test emails stay unchanged so updates preserve existing data. Displayed hotel branding is WN.

### Update the existing Vultr test stack on port 3001

Run on the Vultr server:
```bash
cd /opt/wh-hotel
git pull --ff-only
docker compose -f compose.test.yml -f compose.test-port.yml up -d --build
```
Use your existing compose.test-port.yml override for 127.0.0.1:3001:3000. Do not run down -v: it deletes test bookings and uploaded photos.

Admin → Rooms → Upload room photo → choose a JPEG/PNG/WebP file. Maximum 5 MiB / 20 megapixels, 8 photos per room category. Upload saves immediately. Save other edits before uploading. The server re-encodes to WebP, strips metadata and stores files in a Docker volume. Website/App read the same photo addresses. The photo list lets you remove an attachment after Save; shared/orphan files are retained on disk.

### Test the Android App without rebuilding for each server address

Download the newest Android preview APK from GitHub Actions → WN Expo Mobile (or WH Expo Mobile for older runs) → Artifacts. Extract the ZIP and install the APK on an ARM64 Android phone.

1. Put your Windows PC and phone on the same **private Wi-Fi**.
2. Open Windows PowerShell, and enter your real Vultr IPv4 when prompted:

```powershell
$wnVps = Read-Host "Enter your Vultr Public IPv4"
ssh -N -g -L 0.0.0.0:3001:127.0.0.1:3001 -L 0.0.0.0:9099:127.0.0.1:9099 "root@$wnVps"
```

Close any earlier SSH tunnel using ports 3001/9099 before starting this command. Keep this window open. This exposes the forwarded test ports on your PC's private LAN, not the Vultr public interface. Use a trusted private network and allow these ports only from LocalSubnet in Windows Firewall.

3. In another PowerShell window run `ipconfig`. Find the PC Wi-Fi IPv4, e.g. 192.168.1.50.
4. On the phone, open the WN App. The first screen accepts:
   - Hotel API URL: `http://192.168.1.50:3001/api`
   - Test authentication URL: `http://192.168.1.50:9099`
   Replace the example private IP with your PC's actual Wi-Fi IPv4.
5. Tap **Connect private test server**. Account → email login as `guest@wh.test`, password `WhTestOnly2026!`.
6. Book in the App. In the PC browser open `http://localhost:3001/admin`, approve as `admin@wh.test`. Refresh My bookings in the App and simulate payment.
7. Admin-uploaded photos appear after refresh / search. The WN logo is displayed on both platforms.

For Windows firewall trouble, run in an **Administrator PowerShell**:
```powershell
New-NetFirewallRule -DisplayName "WN private test tunnel" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3001,9099 -RemoteAddress LocalSubnet -Profile Private
```
Only use the rule on a trusted Private network. After testing, close the SSH tunnel and remove the rule:
```powershell
Remove-NetFirewallRule -DisplayName "WN private test tunnel"
```

Do not enter `https://payapi.uk` on the private-emulator screen. The domain currently points to the separate production stack. Public-domain login requires real Firebase setup. The private test screen intentionally rejects public emulator addresses.

For iPhone: the GitHub iOS artifact is for an Apple Silicon Mac simulator. Physical iPhone installation requires a signed development build or TestFlight with Apple Developer membership. This project uses Expo SDK 55; the App Store Expo Go build does not support SDK 55. An Android APK cannot be installed on iPhone. See https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/ . The same API/auth fields are available when running this source on iOS.

### Photo backup

Production photo volume: `wh-hotel_wh_photos`; local-test volume: `wh-final-test_wh_test_photos`. Back up the photo volume along with PostgreSQL. A DB dump alone does not contain the uploaded image files.
