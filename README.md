# WH Hotel — starter v0.1

WH ဟိုတယ်တစ်ခုတည်းအတွက် Next.js website + NestJS API + PostgreSQL starter ဖြစ်ပါတယ်။
Flutter mobile app source ကို `apps/mobile` မှာ ထည့်ထားပါတယ်။ [Mobile setup guide](apps/mobile/README.md) ကို ဖတ်ပါ။

**Production-ready booking/payment product မဟုတ်သေးပါ။** ပထမအဆင့်မှာ setup/run လုပ်ပြီး ဆက်တည်ဆောက်နိုင်ဖို့ ရည်ရွယ်ပါတယ်။

## ပါဝင်ပြီးသောအပိုင်း

- Responsive customer room page (CSS room illustrations, real photos မဟုတ်သေး)
- Dates/guests နဲ့ room availability search
- Firebase Google/Apple popup login, phone OTP signup/linking, email verification prompt
- Backend Firebase token verification; verified phone ရှိမှ booking ခွင့်ပြု
- Server-side total price, 30-minute booking request hold
- PostgreSQL exclusion constraint ဖြင့် physical-room overlap ကာကွယ်မှု
- User-scoped idempotency keys, request mismatch rejection
- Admin UID allowlist; booking accept/reject dashboard + audit record
- Accept လုပ်ပြီး payment deadline 10 minutes; periodic expired hold cleanup
- Docker Compose, DB migration, backup script, CI and optional VPS auto-deploy

## ဆက်တည်ဆောက်ရမည့်အပိုင်း

- Live payment providers/webhooks/refunds: contract only, credentials မပါ
- Payment confirmation: ဒီ version က CONFIRMED အဖြစ် ပြောင်းပေးမယ့် payment flow မပါ
- Admin room/photo/rate editor, custom roles/staff account management
- Daily rates/tax/deposit/cancellation policies, multi-room booking
- Full calendar UI, maintenance blocks, notifications
- Email/password login UI, polished account collision/recovery flow
- Live mobile payment integration and signed mobile store releases (Flutter room/auth/booking screens are implemented in v0.2)
- Production abuse prevention, OTP limits, admin MFA, monitoring and recovery hardening

Firebase key မဖြည့်ထားရင် room browsing/availability ရပါတယ်။ Login/booking/admin API က configuration error ပေးပြီး ပိတ်ထားပါတယ်။ Demo login bypass မရှိပါ။

## 1. Ubuntu 24.04 မှာ run နည်း

GitHub repository တင်ပြီးသားဖြစ်မှ clone URL ကို သုံးပါ။ ZIP ကို ဖြည်ထားရင် အဲဒီ project folder ထဲဝင်ပါ။

```bash
sudo apt update
sudo apt install -y git docker.io docker-compose-v2 nginx certbot python3-certbot-nginx
sudo systemctl enable --now docker

sudo git clone https://github.com/AungKhantPaing5/wh-hotel.git /opt/wh-hotel
cd /opt/wh-hotel
sudo cp .env.example .env
sudo nano .env
```

အရင်ဆုံး ပြင်ရန်:

```dotenv
POSTGRES_PASSWORD=your_long_random_letters_and_numbers
WEB_PORT=3000
WEB_ORIGIN=https://your-hotel-domain.com
```

Password ကို 32 characters အနည်းဆုံး random hex/alphanumeric သုံးပါ။ URL escaping လိုတဲ့ punctuation ကို ဒီ starter မှာ မသုံးပါနှင့်။

```bash
openssl rand -hex 24
```

Output ကို ကိုယ့် .env ထဲပဲထည့်ပါ။ Chat/GitHub ထဲ မတင်ပါနှင့်။

```bash
sudo bash scripts/install.sh
sudo docker compose ps
curl -I http://127.0.0.1:3000
sudo docker compose exec -T api node -e "fetch('http://localhost:4000/v1/health/ready').then(r=>r.text()).then(console.log)"
```

ပထမ build မှာ dependency download လုပ်ရလို့ ကြာနိုင်ပါတယ်။ migrate service က Exited (0) ဖြစ်တာ ပုံမှန်ပါ။ web/api/db က running ဖြစ်ရပါမယ်။

Website port ကို loopback မှာပဲဖွင့်ထားပါတယ်။ Public IP:3000 ကို တိုက်ရိုက်ဖွင့်မရတာ ပုံမှန်ပါ။

Local PC ပေါ်မှာ Docker သုံးရင် `WEB_ORIGIN=http://localhost:3000` ထားပြီး `http://localhost:3000` မှဖွင့်ပါ။

## 2. Domain + HTTPS

Domain ရဲ့ DNS A record ကို VPS IPv4 ဆီညွှန်ပါ။

```bash
cd /opt/wh-hotel
sudo cp infra/nginx.conf.example /etc/nginx/sites-available/wh-hotel
sudo nano /etc/nginx/sites-available/wh-hotel
```

`YOUR_DOMAIN` ကို ကိုယ့် domain နဲ့ အစားထိုးပါ။

```bash
sudo ln -s /etc/nginx/sites-available/wh-hotel /etc/nginx/sites-enabled/wh-hotel
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d your-hotel-domain.com
```

DNS/HTTP port 80 reachability လိုအပ်ပါတယ်။ 80/443 ကို 3x-ui/Outline စတာတွေ သုံးထားပြီးသား VPS ဆိုရင် ဒီ Nginx setup ကို မတင်ခင် existing listener တွေ စစ်ပါ။ Dedicated domain တစ်ခုထည့်ရုံနဲ့ တခြား service ရဲ့ 443 listener နဲ့ အလိုအလျောက်မျှသုံးလို့မရပါ။

```bash
sudo ss -ltnp
```

## 3. Firebase login setup

1. Firebase Console မှာ project ဖန်တီးပါ။
2. Authentication → Sign-in method မှ Google, Apple, Phone ဖွင့်ပါ။
3. Authentication → Settings → Authorized domains ထဲ hotel domain နဲ့ localhost ထည့်ပါ။
4. Project Settings → Web app မှ config ယူပြီး .env ဖြည့်ပါ။

```dotenv
NEXT_PUBLIC_FIREBASE_API_KEY=your_public_web_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project
NEXT_PUBLIC_FIREBASE_APP_ID=your_web_app_id
FIREBASE_PROJECT_ID=your-project
```

5. Service Accounts မှ Admin SDK JSON ထုတ်ပြီး `/opt/wh-hotel/secrets/firebase-admin.json` အဖြစ် ကူးပါ။ Repository ထဲမထည့်ပါနှင့်။
6. Container က node user UID 1000 နဲ့ run ပါတယ်။ JSON ကို အဲဒီ user ဖတ်နိုင်အောင် ownership/permissions သတ်မှတ်ပါ။

```bash
sudo mkdir -p secrets
sudo chown -R 1000:1000 secrets
sudo chmod 700 secrets
sudo chmod 600 secrets/firebase-admin.json
sudo docker compose up -d --build
```

Firebase web config က build-time variable ဖြစ်တဲ့အတွက် ပြောင်းတိုင်း web rebuild လုပ်ရပါတယ်။

Google sign-in အတွက် provider setup; Apple အတွက် Apple Developer Service ID, Team ID, Key နဲ့ Firebase callback URL setup လိုပါတယ်။
Phone OTP အတွက် Firebase SMS billing/region policy ကို စစ်ပြီး test phone numbers နဲ့ စမ်းပါ။ Myanmar SMS delivery ကို အမှန်တကယ်စမ်းပြီးမှ production ဖွင့်ပါ။

## 4. Admin ဘယ်လိုဝင်မလဲ

Default admin username/password မရှိပါ။

1. Customer page → My account → Google နဲ့ ဝင်ပါ။
2. Firebase Console → Authentication → Users မှ အဲဒီ user ရဲ့ UID ကိုယူပါ။
3. `.env` မှာ `ADMIN_UIDS=that-firebase-uid` ထည့်ပါ။ အများကြီးဆို comma ခွဲပါ။
4. `sudo docker compose up -d api` ပြန်လုပ်ပါ။
5. `https://your-domain/admin` မှ Google အကောင့်တူနဲ့ ဝင်ပါ။

Staff role UI မပါသေးပါ။ ADMIN_UIDS ထဲထည့်တာက booking admin အပြည့်ပေးတာဖြစ်ပါတယ်။

## 5. ဘယ်ဖိုင်မှာ ဘာပြင်မလဲ

| ပြင်လိုသည့်အရာ | နေရာ |
|---|---|
| Domain, DB password, Firebase, admin UID | `.env` |
| Customer text/layout | `apps/web/src/app/page.tsx` |
| Colors/spacing/design | `apps/web/src/app/style.css` |
| Website title/description | `apps/web/src/app/layout.tsx` |
| Admin booking page | `apps/web/src/app/admin/page.tsx` |
| Booking rules/API | `apps/api/src/main.ts` |
| Date validation | `apps/api/src/dates.ts` |
| First-install sample rooms/rates | `apps/api/sql/001.sql` |
| Payment integration interface | `apps/api/src/payment-provider.ts` |
| Nginx domain/proxy | `/etc/nginx/sites-available/wh-hotel` |
| Flutter mobile app | `apps/mobile/lib/` |
| CI / deployment | `.github/workflows/` |

Migration 001 က first install တစ်ကြိမ်ပဲ run ပါတယ်။ Install ပြီးမှ 001.sql ကို edit လုပ်တာနဲ့ ရှိပြီးသား DB မပြောင်းပါ။ နောက် version အတွက် migration အသစ်ရေးပြီး migrate.mjs မှာ version register လုပ်ရပါမယ်။

လက်ရှိ demo price ပြောင်းရန် (အောက်က 9,500,000 minor units = 95,000 MMK ဆိုပြီး ဒီ starter မှာ decimal places 2 ယူထားပါတယ်):

```bash
sudo docker compose exec db psql -U wh -d wh_hotel
```

```sql
SELECT id,name,nightly_amount_minor FROM room_types;
UPDATE room_types SET nightly_amount_minor=9500000 WHERE id=1;
\q
```

UI မှာ price ကို 100 နဲ့စားပြီးပြပါတယ်။ Payment provider ချိတ်ချိန်မှာ currency exponent ကို official docs အတိုင်း adapter ထဲ convert လုပ်ရပါမယ်။

Customer က category တစ်ခုနဲ့ room တစ်ခန်းကို request လုပ်နိုင်ပါတယ်။ Request ကို မိနစ် 30 အတွင်း admin မလက်ခံရင် expire ဖြစ်ပါတယ်။ Accept လုပ်ပြီး payment window 10 minutes ရပါတယ်။ **Payment မချိတ်ရသေးတဲ့ version ဖြစ်လို့ window ကုန်ရင် expire ပြန်ဖြစ်ပါမယ်။**

## 6. GitHub ပေါ်တင်ရန်

Repository မရှိသေးရင် GitHub မှာ `wh-hotel` နာမည်နဲ့ ဖန်တီးပါ။ Connector ကနေ upload လုပ်ဖို့ဆို README ပါတဲ့ initial commit ထည့်ပါ။

ကိုယ်တိုင် Git CLI နဲ့တင်မယ်ဆို empty repository ရွေးပြီး project root မှာ:

```bash
git init
git branch -M main
git add .
git commit -m "Add WH Hotel starter"
git remote add origin https://github.com/AungKhantPaing5/wh-hotel.git
git push -u origin main
```

GitHub authentication ကို GitHub CLI သို့မဟုတ် credential manager နဲ့လုပ်ပါ။ Token ကို command URL ထဲ မထည့်ပါနှင့်။

## 7. GitHub push → VPS auto-update

ပထမဆုံး manual install အလုပ်လုပ်ပြီးမှ ဖွင့်ပါ။ ဒီ starter က CI စစ်ပြီးတဲ့ commit ကို VPS မှာ Docker rebuild လုပ်ပါတယ်။ GHCR မလိုပါ။ VPS မှာ Git နဲ့ build resources လိုပြီး deployment အတွင်း brief downtime ဖြစ်နိုင်ပါတယ်။

VPS project folder `/opt/wh-hotel` ဖြစ်ရပါမယ်။ SSH user က အဲဒီ folder ကို edit လုပ်နိုင်ပြီး Docker သုံးခွင့်ရှိရပါမယ်။ Docker group access က host ပေါ် privileged access ဖြစ်တာကြောင့် dedicated deployment account သုံးပါ။

GitHub → Settings → Secrets and variables → Actions → Secrets:

```text
VPS_HOST         server IP or SSH hostname
VPS_USER         deployment Linux user
VPS_SSH_KEY      dedicated SSH private key
VPS_KNOWN_HOSTS  verified server known_hosts entry
```

Private repository ဆို VPS မှာ read-only GitHub deploy key ချိတ်ထားရပါမယ်။ `git fetch origin main` ကို VPS မှာ manual အရင်စမ်းပါ။

GitHub → Settings → Environments မှ `production` ဖန်တီးပါ။ Variables မှာ:

```text
AUTO_DEPLOY=true
```

ပြီးရင် main push → WH CI pass → WH Deploy → VPS update ဖြစ်ပါမယ်။ VPS secrets မဖြည့်ရသေးရင် AUTO_DEPLOY ကို မဖွင့်ပါနှင့်။

Deployment script မှာ health checks ပါပေမယ့် automatic rollback မပါပါ။ ယခင် SHA ကို `.previous-release` မှာ သိမ်းပါတယ်။ Schema change နဲ့ ကိုက်ညီမှုစစ်ပြီးမှ previous version ပြန်တင်ပါ။ DB rollback ကို git checkout နဲ့ မလုပ်နိုင်ပါ။

```bash
sudo docker compose logs --tail=100 api web migrate
sudo docker compose ps
```

## 8. Flutter app စတင် run နည်း

```bash
bash scripts/init-mobile.sh
cd apps/mobile
flutter run
```

ဒီ command က default Preview mode နဲ့ဖွင့်ပါတယ်။ Full mobile source မှာ rooms/date selection, Google/Apple/Phone/Email auth, profile verification, booking requests/history screens ပါဝင်ပါတယ်။ Live API/Firebase configuration ဖြည့်မှ real login/booking သုံးနိုင်ပါမယ်။ Payment မချိတ်ရသေးပါ။

အသေးစိတ် run/build/Firebase/iOS လမ်းညွှန်ကို [apps/mobile/README.md](apps/mobile/README.md) မှာကြည့်ပါ။ GitHub Actions → WH Mobile က Android testing APK နဲ့ unsigned iOS build ထုတ်ပေးပါတယ်။

## 9. Backup

```bash
cd /opt/wh-hotel
sudo bash scripts/backup.sh
```

`backups/` မှ dump ကို သီးခြားနေရာဆီကူးပါ။ DB credentials/Firebase service key ကို သီးခြား secure backup လုပ်ပါ။
Restore ကို disposable database ပေါ်မှာအရင်စမ်းပါ။ `docker compose down -v` က DB volume ဖျက်နိုင်လို့ data ရှိတဲ့ server မှာ မသုံးပါနှင့်။

## 10. Verification

```bash
npm ci
npm run build
npm test
```

Local environment မှာ Next.js production build, NestJS TypeScript build, date validation tests pass ဖြစ်ပါတယ်။ PostgreSQL inventory integration test က DATABASE_URL မရှိရင် skip ပါတယ်။ CI က PostgreSQL service နဲ့ migration/inventory test ကို run ပါတယ်။
Docker/Flutter runtimes မရှိတဲ့ creation environment ဖြစ်လို့ Docker end-to-end နဲ့ native app build ကို ဒီနေရာမှာ မစစ်ရသေးပါ။ Firebase real-provider login, SMS delivery နဲ့ live payments ကို မစမ်းရသေးပါ။

Dependency audit (`npm audit --omit=dev`) က creation time မှာ vulnerabilities 0 ပြပါတယ်။ Root package.json မှာ transitive gRPC version ကို security fix ပါတဲ့ 1.14.6 နဲ့ pin လုပ်ထားပါတယ်။

## Official references

- https://firebase.google.com/docs/auth/admin/verify-id-tokens
- https://firebase.google.com/docs/auth/web/account-linking
- https://www.postgresql.org/docs/current/rangetypes.html
- https://docs.flutter.dev/deployment/cd
- https://docs.github.com/en/actions
- https://docs.stripe.com/webhooks

## Next implementation order

1. Configure and test Firebase login/phone linking on HTTPS.
2. Add admin room/photo/rate editor and staff RBAC.
3. Implement audited payment sessions, verified webhooks, refunds and reconciliation.
4. Add booking notifications and policies.
5. Configure and device-test mobile authentication/booking; integrate payments.
6. Add signed store releases, production security review and restore drills.
