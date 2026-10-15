# WH — Local acceptance / final-test guide

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
7. Rooms → price / amenities / HTTPS photo URL ပြင်ပါ။ Customer ကို reload လုပ်ရင် အသစ်ပြရမယ်။ ရှိပြီးသား booking total က မပြောင်းရပါ။
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

Tests ပြီးရင် test guest bookings၊ changed room rates / physical availability နဲ့ staff permission fixture ကို cleanup/restore လုပ်ပါတယ်။ GitHub Actions **WH Local Acceptance** က disposable stack နဲ့ အလိုအလျောက် run ပေးပါတယ်။

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
- GitHub preview APK ထဲ config က build-time value ဖြစ်ပါတယ်။ Download ပြီးမှ `.env` ပြင်တာနဲ့ APK မပြောင်းပါ။ Dynamic local testing အတွက် `npm start` + Expo Go/development build ကိုသုံးပါ။
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

Room photo **URLs** editing ပါပြီး file upload/storage pipeline မပါသေးပါ။ Staff permission management ပါပြီး production staff invitation/account deletion workflow မပါသေးပါ။ Refund/cancellation policies၊ notifications၊ advanced reports/accounting၊ full housekeeping/PMS၊ SMS-based account recovery နဲ့ monitoring/backup restore drills ကို ထပ်ပြီးအပြီးသတ်ရန်လိုပါတယ်။
