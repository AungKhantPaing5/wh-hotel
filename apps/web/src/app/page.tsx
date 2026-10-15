"use client";
import { useEffect, useRef, useState } from "react";
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signOut,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  linkWithPhoneNumber,
  verifyBeforeUpdateEmail,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  type ConfirmationResult,
} from "firebase/auth";
import { api, auth } from "../lib/firebase";

type Room = {
  id: number;
  name: string;
  description: string;
  nightly_amount_minor: string;
  max_guests: number;
  amenities: string[];
  photo_urls?: string[];
  available_rooms?: number;
};
type Booking = {
  id: string;
  status: string;
  check_in: string;
  check_out: string;
  total_amount_minor: string;
};
const localTest = process.env.NEXT_PUBLIC_LOCAL_TEST === "true";
const money = (minor: string) =>
  new Intl.NumberFormat("en-US").format(Number(minor) / 100) + " MMK";

export default function Home() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(2);
  const [message, setMessage] = useState("");
  const [account, setAccount] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState<{
    uid: string;
    needsEmail: boolean;
    needsPhone: boolean;
  } | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [busy, setBusy] = useState(false);
  const confirmation = useRef<ConfirmationResult | null>(null);
  const captcha = useRef<RecaptchaVerifier | null>(null);
  const request = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    api("rooms")
      .then(setRooms)
      .catch((e) => setMessage(e.message));
  }, []);
  async function task(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function refreshProfile() {
    setProfile(await api("me", {}, true));
    setBookings(await api("bookings", {}, true));
  }
  async function login(provider: "google" | "apple") {
    await signInWithPopup(
      auth(),
      provider === "google"
        ? new GoogleAuthProvider()
        : new OAuthProvider("apple.com"),
    );
    await refreshProfile();
  }
  async function sendOtp() {
    if (!/^\+[1-9]\d{7,14}$/.test(phone))
      throw new Error("Use international format, for example +959...");
    captcha.current ||= new RecaptchaVerifier(auth(), "captcha", {
      size: "invisible",
    });
    const current = auth().currentUser;
    confirmation.current = current
      ? await linkWithPhoneNumber(current, phone, captcha.current)
      : await signInWithPhoneNumber(auth(), phone, captcha.current);
    setMessage("OTP sent. Enter the SMS code below.");
  }
  async function verifyOtp() {
    if (!confirmation.current) throw new Error("Request an OTP first.");
    await confirmation.current.confirm(code);
    await auth().currentUser?.getIdToken(true);
    await refreshProfile();
    setMessage("Phone verified.");
  }
  async function book(room: Room) {
    if (!checkIn || !checkOut)
      throw new Error("Select check-in and check-out dates.");
    const body = { roomTypeId: room.id, checkIn, checkOut, guests };
    const currentUid = auth().currentUser?.uid;
    if (!currentUid) throw new Error("Sign in first.");
    const fingerprint = JSON.stringify([currentUid, body]);
    const storageKey = `wh.booking.request.${currentUid}`;
    if (request.current?.fingerprint !== fingerprint) {
      const saved = sessionStorage.getItem(storageKey);
      const prior = saved ? JSON.parse(saved) : null;
      request.current = prior?.fingerprint === fingerprint && typeof prior.key === 'string'
        ? prior : { fingerprint, key: crypto.randomUUID() };
    }
    const activeRequest = request.current;
    if (!activeRequest) throw new Error('Review your booking request again.');
    sessionStorage.setItem(storageKey, JSON.stringify(activeRequest));
    const result = await api(
      "bookings",
      {
        method: "POST",
        headers: { "Idempotency-Key": activeRequest.key },
        body: JSON.stringify(body),
      },
      true,
    );
    if (['EXPIRED', 'REJECTED', 'CANCELLED'].includes(result.status)) {
      sessionStorage.removeItem(storageKey);
      request.current = null;
      throw new Error('Your earlier request is closed. Search availability and submit again.');
    }
    setMessage(
      `Request ${result.id} received. Status: ${result.status}. Admin approval is required; payment is not connected in this starter.`,
    );
    await refreshProfile();
  }
  return (
    <>
      <header>
        <a className="brand" href="/">
          WH<span>HOTEL & STAYS</span>
        </a>
        <nav>
          <a href="#rooms">Our rooms</a>
          <a href="/admin">Admin</a>
          <button
            onClick={() => {
              setAccount(!account);
              if (authSafe()) void task(refreshProfile);
            }}
          >
            My account
          </button>
        </nav>
      </header>
      <main>
        {localTest && (
          <div className="notice">
            LOCAL TEST ONLY · Test accounts and simulated payments. No real SMS
            or money.
          </div>
        )}
        <section className="hero">
          <div className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</div>
          <h1>
            Slow down.
            <br />
            Stay a little longer.
          </h1>
          <p>
            A welcoming space, thoughtful comforts, and time for what matters.
            Discover your stay at WH.
          </p>
          <a className="button light" href="#rooms">
            Find your room ↗
          </a>
          <div className="hero-mark">WH</div>
        </section>
        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault();
            void task(async () => {
              setRooms(
                await api(
                  `availability?checkIn=${checkIn}&checkOut=${checkOut}`,
                ),
              );
            });
          }}
        >
          <label>
            Check-in
            <input
              required
              type="date"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
            />
          </label>
          <label>
            Check-out
            <input
              required
              type="date"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
            />
          </label>
          <label>
            Guests
            <select
              value={guests}
              onChange={(e) => setGuests(Number(e.target.value))}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <button disabled={busy}>Check availability</button>
        </form>
        <div role="status" className={message ? "notice" : ""}>
          {message}
        </div>
        {account && (
          <section className="account">
            <h2>Your WH account</h2>
            <p>Sign in, verify your phone, and manage your booking requests.</p>
            <div className="row">
              <button
                disabled={busy || localTest}
                onClick={() => void task(() => login("google"))}
              >
                Continue with Google
              </button>
              <button
                disabled={busy || localTest}
                onClick={() => void task(() => login("apple"))}
              >
                Continue with Apple
              </button>
              <button
                className="secondary"
                onClick={() =>
                  void task(async () => {
                    await signOut(auth());
                    setProfile(null);
                    setBookings([]);
                  })
                }
              >
                Sign out
              </button>
            </div>
            <div className="row">
              <input
                type="email"
                aria-label="Login email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                type="password"
                aria-label="Login password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                disabled={busy}
                onClick={() =>
                  void task(async () => {
                    await signInWithEmailAndPassword(auth(), email, password);
                    setPassword("");
                    await refreshProfile();
                  })
                }
              >
                Email sign in
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  void task(async () => {
                    const result = await createUserWithEmailAndPassword(
                      auth(),
                      email,
                      password,
                    );
                    await sendEmailVerification(result.user);
                    setPassword("");
                    await refreshProfile();
                    setMessage("Verify your email and phone.");
                  })
                }
              >
                Create email account
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  void task(async () => {
                    await sendPasswordResetEmail(auth(), email);
                    setMessage(
                      "If the account exists, check your email for reset instructions.",
                    );
                  })
                }
              >
                Reset password
              </button>
            </div>
            <div className="row">
              <input
                aria-label="Phone number"
                placeholder="Phone: +959..."
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <button disabled={busy} onClick={() => void task(sendOtp)}>
                Send / link phone OTP
              </button>
              <input
                aria-label="SMS code"
                placeholder="SMS code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <button disabled={busy} onClick={() => void task(verifyOtp)}>
                Verify
              </button>
            </div>
            <div id="captcha" />
            {profile && (
              <>
                <p>
                  {profile.needsPhone
                    ? "Verify your phone before booking."
                    : "Phone verified."}{" "}
                  {profile.needsEmail
                    ? "Please add and verify your email."
                    : "Email verified."}
                </p>
                <div className="row">
                  <input
                    type="email"
                    aria-label="Email"
                    placeholder="Your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <button
                    disabled={busy}
                    onClick={() =>
                      void task(async () => {
                        const u = auth().currentUser;
                        if (!u) throw new Error("Sign in first");
                        await verifyBeforeUpdateEmail(u, email);
                        setMessage(
                          "Verification email sent. Follow the link, then refresh your profile.",
                        );
                      })
                    }
                  >
                    Verify email
                  </button>
                  <button
                    onClick={() =>
                      void task(async () => {
                        await auth().currentUser?.reload();
                        await auth().currentUser?.getIdToken(true);
                        await refreshProfile();
                      })
                    }
                  >
                    Refresh profile
                  </button>
                </div>
              </>
            )}
            {bookings.map((b) => (
              <div className="booking" key={b.id}>
                <strong>{b.status}</strong> · {String(b.check_in).slice(0, 10)}{" "}
                → {String(b.check_out).slice(0, 10)} ·{" "}
                {money(b.total_amount_minor)}
                <small>{b.id}</small>
                {localTest && b.status === "AWAITING_PAYMENT" && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void task(async () => {
                        await api(
                          `local-test/bookings/${b.id}/pay`,
                          { method: "POST" },
                          true,
                        );
                        await refreshProfile();
                        setMessage(
                          "SIMULATED payment only. No money was charged.",
                        );
                      })
                    }
                  >
                    Simulate payment — no money
                  </button>
                )}
              </div>
            ))}
          </section>
        )}
        <section id="rooms">
          <div className="eyebrow">MAKE YOURSELF AT HOME</div>
          <h2>Room to unwind.</h2>
          <p className="muted">
            A space for every kind of stay. Demo rates shown; final rates are
            calculated by the hotel.
          </p>
          <div className="grid">
            {rooms.map((room, i) => (
              <article key={room.id}>
                {room.photo_urls?.[0] ? (
                  <img
                    src={room.photo_urls[0]}
                    alt={room.name}
                    style={{ width: "100%", height: 240, objectFit: "cover" }}
                  />
                ) : (
                  <div className={`room-art art-${i}`}>
                    <span>WH COLLECTION</span>
                    <div className="bed" />
                    <b>{room.name}</b>
                  </div>
                )}
                <div className="room-content">
                  <h3>{room.name}</h3>
                  <p>{room.description}</p>
                  <div className="tags">
                    {room.amenities.map((a) => (
                      <span key={a}>{a}</span>
                    ))}
                  </div>
                  <p>
                    Up to {room.max_guests} guests{" "}
                    {room.available_rooms !== undefined &&
                      `· ${room.available_rooms} rooms available`}
                  </p>
                  <div className="room-bottom">
                    <div>
                      <strong>{money(room.nightly_amount_minor)}</strong>
                      <small>per night · demo rate</small>
                    </div>
                    <button
                      disabled={
                        busy ||
                        guests > room.max_guests ||
                        room.available_rooms === 0
                      }
                      onClick={() => void task(() => book(room))}
                    >
                      Request stay
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
      <footer>
        <strong>WH</strong>
        <span>One hotel. A personal welcome.</span>
        <small>Starter version · Online payments are not enabled.</small>
      </footer>
    </>
  );
}
function authSafe() {
  try {
    return !!auth().currentUser;
  } catch {
    return false;
  }
}
