"use client";
import { useEffect, useRef, useState } from "react";
import {
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  api,
  auth,
} from "../lib/session";
import { GuestKitchen, ChangePassword } from "../components/hotel-tools";

type Room = {
  id: number;
  name: string;
  description: string;
  nightly_amount_minor: string;
  max_guests: number;
  amenities: string[];
  photo_urls?: string[];
  available_rooms?: number;
  room_numbers?: string[];
};
type Booking = {
  id: string;
  status: string;
  check_in: string;
  check_out: string;
  total_amount_minor: string;
  room_number?: string;
  room_type?: string;
  checked_in_at?: string;
  checked_out_at?: string;
};
type Profile = {
  uid: string;
  needsEmail: boolean;
  needsPhone: boolean;
  mustChangePassword?: boolean;
  phone: string | null;
};
type AuthView = "login" | "signup" | "reset" | "contact";
const localTest = process.env.NEXT_PUBLIC_LOCAL_TEST === "true";
const money = (minor: string) =>
  new Intl.NumberFormat("en-US").format(Number(minor) / 100) + " MMK";
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
function Icon({ name }: { name: "arrow" | "close" | "eye" | "mail" | "user" }) {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === "arrow" ? (
        <path d="M4 12h16m-6-6 6 6-6 6" />
      ) : name === "close" ? (
        <path d="m6 6 12 12M6 18 18 6" />
      ) : name === "mail" ? (
        <>
          <rect x="3" y="5" width="18" height="14" rx="3" />
          <path d="m3 6 9 7 9-7" />
        </>
      ) : name === "user" ? (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
        </>
      ) : (
        <>
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}
export default function Home() {
  const [photoIndex, setPhotoIndex] = useState<Record<number, number>>({});
  const [bookingRoom, setBookingRoom] = useState<number | null>(null),
    [bookingMessage, setBookingMessage] = useState("");
  const bookingPanel = useRef<HTMLFormElement | null>(null);

  const [rooms, setRooms] = useState<Room[]>([]),
    [loadingRooms, setLoadingRooms] = useState(true);
  const [checkIn, setCheckIn] = useState(""),
    [checkOut, setCheckOut] = useState(""),
    [guests, setGuests] = useState(2);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(false),
    [account, setAccount] = useState(false),
    [profile, setProfile] = useState<Profile | null>(null),
    [bookings, setBookings] = useState<Booking[]>([]);
  const [authView, setAuthView] = useState<AuthView | null>(null),
    [authMessage, setAuthMessage] = useState("");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [repeatPassword, setRepeatPassword] = useState(""),
    [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const dialog = useRef<HTMLDialogElement | null>(null),
    firstInput = useRef<HTMLInputElement | null>(null),
    accountPanel = useRef<HTMLElement | null>(null);
  const request = useRef<{ fingerprint: string; key: string } | null>(null);
  const initiator = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (bookingRoom !== null && !authView) {
      bookingPanel.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      bookingPanel.current
        ?.querySelector<HTMLInputElement>("input")
        ?.focus({ preventScroll: true });
    }
  }, [bookingRoom, authView]);

  useEffect(() => {
    api("rooms")
      .then(setRooms)
      .catch((e) => setMessage(e.message))
      .finally(() => setLoadingRooms(false));
    try {
      return onAuthStateChanged(auth(), (user) => {
        setSignedIn(Boolean(user));
        if (user) {
          void api("me", {}, true)
            .then((next: Profile) => {
              if (auth().currentUser?.uid !== user.uid) return;
              setProfile(next);
              setPhone(next.phone || "");
              if (next.needsPhone) {
                setAuthMessage(
                  "Complete your account: add your phone number. No SMS code is required.",
                );
                setAuthView("contact");
              }
            })
            .catch((error) => setMessage(error.message));
        }
        if (!user) {
          setProfile(null);
          setBookings([]);
          setAccount(false);
        }
      });
    } catch {
      /* Room browsing remains available before sign-in setup. */
    }
  }, []);
  useEffect(() => {
    const el = dialog.current;
    if (authView && el) {
      if (!el.open) {
        initiator.current = document.activeElement as HTMLElement;
        el.show();
      }
      const old = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const background = Array.from(
        document.querySelectorAll<HTMLElement>(".site-header,main,footer"),
      );
      const inertBefore = background.map((node) => node.inert);
      background.forEach((node) => {
        node.inert = true;
      });
      firstInput.current?.focus();
      // Disabling a submitting button can return focus to the document body.
      // Handle Escape there too.
      const onDocumentKey = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeAuth();
        } else if (
          event.key === "Tab" &&
          document.activeElement === document.body
        ) {
          event.preventDefault();
          firstInput.current?.focus();
        }
      };
      document.addEventListener("keydown", onDocumentKey, true);
      return () => {
        document.removeEventListener("keydown", onDocumentKey, true);
        document.body.style.overflow = old;
        background.forEach((node, i) => {
          node.inert = inertBefore[i];
        });
      };
    }
    if (el?.open) {
      el.close();
      initiator.current?.focus();
    }
  }, [authView]);
  useEffect(() => {
    if (account && accountPanel.current) {
      accountPanel.current.focus({ preventScroll: true });
      accountPanel.current.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
    }
  }, [account]);
  useEffect(() => {
    if (!signedIn || !account) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        void api("bookings", {}, true)
          .then(setBookings)
          .catch(() => {});
    }, 10000);
    return () => clearInterval(timer);
  }, [signedIn, account]);
  function openAuth(view: AuthView) {
    setAuthMessage("");
    setPassword("");
    setRepeatPassword("");
    setShowPassword(false);
    setAuthView(view);
  }
  function closeAuth() {
    setAuthView(null);
    setPassword("");
    setRepeatPassword("");
  }
  async function task(fn: () => Promise<unknown>, inDialog = false) {
    if (busy) return;
    setBusy(true);
    inDialog ? setAuthMessage("") : setMessage("");
    try {
      await fn();
    } catch (e) {
      (inDialog ? setAuthMessage : setMessage)((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function refreshProfile() {
    await auth().authStateReady();
    const nextProfile: Profile = await api("me", {}, true);
    setProfile(nextProfile);
    setBookings(await api("bookings", {}, true));
    return nextProfile;
  }
  async function finishLogin() {
    setSignedIn(true);
    const nextProfile = await refreshProfile();
    if (nextProfile.needsPhone) {
      setAccount(false);
      openAuth("contact");
      setAuthMessage(
        "Complete your account: add your phone number. No SMS code is required.",
      );
      return;
    }
    closeAuth();
    setAccount(bookingRoom === null);
  }
  async function submitEmail() {
    if (authView === "reset") {
      await sendPasswordResetEmail(auth(), email.trim());
      setAuthMessage(
        "If this account exists, a password reset link is on its way. Check your inbox and spam folder.",
      );
      return;
    }
    if (authView === "signup") {
      if (password !== repeatPassword)
        throw new Error("Your passwords do not match.");
      const result = await createUserWithEmailAndPassword(
        auth(),
        email.trim(),
        password,
        phone,
      );
      await finishLogin();
      setMessage("Your account is ready.");
    } else {
      await signInWithEmailAndPassword(auth(), email.trim(), password);
      await finishLogin();
    }
  }
  async function savePhone() {
    if (phone.length !== 11 || !/^09[0-9]{9}$/.test(phone))
      throw new Error(
        "Phone number must start with 09 and contain exactly 11 digits.",
      );
    await api(
      "me/contact",
      { method: "PATCH", body: JSON.stringify({ phone }) },
      true,
    );
    await finishLogin();
    setMessage("Phone number saved. No SMS verification is required.");
  }
  async function logout() {
    await signOut(auth());
    setSignedIn(false);
    setProfile(null);
    setBookings([]);
    setAccount(false);
    setMessage("You have signed out.");
  }
  async function book(room: Room) {
    if (!checkIn || !checkOut)
      throw new Error("Select check-in and check-out dates first.");
    if (checkOut <= checkIn)
      throw new Error("Check-out must be after check-in.");
    await auth().authStateReady();
    const currentUid = auth().currentUser?.uid;
    if (!currentUid) {
      openAuth("login");
      setAuthMessage(
        "Sign in, then return to your room to send this booking request.",
      );
      return false;
    }
    if ((await api("me", {}, true)).needsPhone) {
      openAuth("contact");
      setAuthMessage("Add your phone number before requesting a stay.");
      return false;
    }
    const body = { roomTypeId: room.id, checkIn, checkOut, guests };
    const fingerprint = JSON.stringify([currentUid, body]),
      storageKey = `wh.booking.request.${currentUid}`;
    if (request.current?.fingerprint !== fingerprint) {
      const saved = sessionStorage.getItem(storageKey);
      let prior = null;
      try {
        prior = saved ? JSON.parse(saved) : null;
      } catch {
        sessionStorage.removeItem(storageKey);
      }
      request.current =
        prior?.fingerprint === fingerprint && typeof prior.key === "string"
          ? prior
          : { fingerprint, key: crypto.randomUUID() };
    }
    const active = request.current;
    if (!active) throw new Error("Review your booking and try again.");
    sessionStorage.setItem(storageKey, JSON.stringify(active));
    const result = await api(
      "bookings",
      {
        method: "POST",
        headers: { "Idempotency-Key": active.key },
        body: JSON.stringify(body),
      },
      true,
    );
    if (["EXPIRED", "REJECTED", "CANCELLED"].includes(result.status)) {
      sessionStorage.removeItem(storageKey);
      request.current = null;
      throw new Error(
        "Your earlier request is closed. Search availability and submit again.",
      );
    }
    await refreshProfile();
    setAccount(true);
    setMessage(
      `Request ${result.id} received. Status: ${result.status}. The hotel will review your request.`,
    );
    return true;
  }
  const phoneMode = authView === "contact";
  const authTitle =
    authView === "signup"
      ? "Make yourself at home"
      : authView === "reset"
        ? "Forgot your password?"
        : authView === "contact"
          ? "Add your phone number"
          : "Welcome back";
  const heroPhoto = rooms.find((r) => r.photo_urls?.[0])?.photo_urls?.[0];
  return (
    <>
      <header className="site-header">
        <a className="brand" href="/" aria-label="WN Hotel home">
          WN<span>HOTEL & STAYS</span>
        </a>
        <nav aria-label="Main navigation">
          <a className="rooms-link" href="#rooms">
            Our rooms
          </a>
          {signedIn ? (
            <>
              <button
                className="nav-login"
                onClick={() => {
                  setAccount(!account);
                  void task(refreshProfile);
                }}
              >
                <Icon name="user" />
                My bookings
              </button>
              <button
                className="nav-login"
                onClick={() => {
                  setAccount(true);
                  void task(async () => {
                    await refreshProfile();
                    setTimeout(
                      () =>
                        document
                          .getElementById("guest-kitchen")
                          ?.scrollIntoView({ behavior: "smooth" }),
                      150,
                    );
                  });
                }}
              >
                Kitchen
              </button>
              <button
                className="nav-signup"
                disabled={busy}
                onClick={() => void task(logout)}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <button
                className="nav-login"
                aria-haspopup="dialog"
                onClick={() => openAuth("login")}
              >
                Login
              </button>
              <button
                className="nav-signup"
                aria-haspopup="dialog"
                onClick={() => openAuth("signup")}
              >
                Sign up <Icon name="arrow" />
              </button>
            </>
          )}
        </nav>
      </header>
      <main>
        {localTest && (
          <div className="notice test-notice">
            LOCAL TEST ONLY · Test accounts and simulated payments. No real SMS
            or money.
          </div>
        )}
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">A STAY THAT FEELS LIKE YOU</div>
            <h1>
              A little pause.
              <br />
              <em>A beautiful stay.</em>
            </h1>
            <p>
              Settle into thoughtful comforts and make time for yourself. Your
              next stay begins at WN.
            </p>
            <a className="button light" href="#rooms">
              Explore our rooms <Icon name="arrow" />
            </a>
            <div className="hero-caption">One hotel. A personal welcome.</div>
          </div>
          <div className={heroPhoto ? "hero-scene has-photo" : "hero-scene"}>
            {heroPhoto ? (
              <img src={heroPhoto} alt="A room at WN Hotel" />
            ) : (
              <div className="scene-arch">
                <span>
                  THE WN
                  <br />
                  COLLECTION
                </span>
                <div className="scene-word">
                  Stay
                  <br />
                  <em>awhile.</em>
                </div>
                <small>Your room. Your rhythm.</small>
              </div>
            )}
            <div className="scene-note">A place to slow down</div>
          </div>
        </section>
        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault();
            void task(async () => {
              if (checkOut <= checkIn)
                throw new Error("Check-out must be after check-in.");
              setLoadingRooms(true);
              try {
                setRooms(
                  await api(
                    `availability?checkIn=${checkIn}&checkOut=${checkOut}`,
                  ),
                );
              } finally {
                setLoadingRooms(false);
              }
            });
          }}
        >
          <label>
            <span>CHECK-IN</span>
            <input
              required
              aria-label="Check-in"
              type="date"
              min={today()}
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
            />
          </label>
          <label>
            <span>CHECK-OUT</span>
            <input
              required
              aria-label="Check-out"
              type="date"
              min={checkIn || today()}
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
            />
          </label>
          <label>
            <span>GUESTS</span>
            <select
              aria-label="Guests"
              value={guests}
              onChange={(e) => setGuests(Number(e.target.value))}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "guest" : "guests"}
                </option>
              ))}
            </select>
          </label>
          <button disabled={busy}>
            Check availability <Icon name="arrow" />
          </button>
        </form>
        {!authView && (
          <div role="status" className={message ? "notice" : ""}>
            {message}
          </div>
        )}
        {account && signedIn && (
          <section
            id="account-panel"
            ref={accountPanel}
            tabIndex={-1}
            className="account"
            aria-labelledby="account-heading"
          >
            <div className="section-heading">
              <div>
                <div className="eyebrow">YOUR NEXT STAY</div>
                <h2 id="account-heading">Your WN account</h2>
              </div>
              <button
                className="secondary"
                disabled={busy}
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
            <p className="muted">
              {auth().currentUser?.email || "Welcome to WN"}
            </p>
            {profile && (
              <>
                <div className="verification-summary">
                  <span>
                    {profile.needsPhone
                      ? "Phone number required"
                      : "Phone number saved."}
                  </span>
                  <span>
                    {profile.needsEmail
                      ? "Contact administration"
                      : "Email saved."}
                  </span>
                </div>
                {profile.needsPhone && (
                  <div className="verification-block">
                    <h3>Add your phone number</h3>
                    <p>
                      Start with 09 and enter exactly 11 digits. No SMS code is
                      required.
                    </p>
                    <button disabled={busy} onClick={() => openAuth("contact")}>
                      Add phone number
                    </button>
                  </div>
                )}
              </>
            )}
            <ChangePassword
              api={api}
              after={logout}
              required={Boolean(profile?.mustChangePassword)}
            />
            <GuestKitchen api={api} bookings={bookings} />
            <h3 className="bookings-heading">Your bookings</h3>
            {bookings.length === 0 ? (
              <p className="empty-state">
                Your next getaway starts here. Choose your dates and find a room
                below.
              </p>
            ) : (
              bookings.map((b) => (
                <div className="booking guest-booking" key={b.id}>
                  <div>
                    <span className="booking-status">{b.status}</span>
                    {b.room_number && (
                      <h3 className="assigned-room">
                        Room {b.room_number} · {b.room_type}
                      </h3>
                    )}
                    <p>
                      {String(b.check_in).slice(0, 10)}{" "}
                      <span aria-hidden="true">—</span>{" "}
                      {String(b.check_out).slice(0, 10)}
                    </p>
                    <small>Booking {b.id}</small>
                  </div>
                  <div>
                    <strong>{money(b.total_amount_minor)}</strong>
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
                </div>
              ))
            )}
          </section>
        )}
        <section id="rooms" className="rooms-section">
          <div className="section-heading">
            <div>
              <div className="eyebrow">YOUR SPACE TO UNWIND</div>
              <h2>Find your kind of comfort.</h2>
            </div>
            <p>
              Thoughtful spaces for a quiet escape
              <br />
              or a little more time together.
            </p>
          </div>
          <div className="grid">
            {loadingRooms ? (
              <p className="empty-state">Finding your room…</p>
            ) : rooms.length === 0 ? (
              <p className="empty-state">
                No rooms available for these dates. Try another stay.
              </p>
            ) : (
              rooms.map((room, i) => (
                <article key={room.id}>
                  <div className="room-image">
                    {room.photo_urls?.[0] ? (
                      <img
                        src={room.photo_urls[photoIndex[room.id] || 0]}
                        alt={room.name}
                        loading="lazy"
                      />
                    ) : (
                      <div className={`room-art art-${i}`}>
                        <span>WN COLLECTION</span>
                        <div className="bed" />
                        <b>{room.name}</b>
                      </div>
                    )}
                    <span className="room-capacity">
                      Up to {room.max_guests} guests
                    </span>
                  </div>
                  {(room.photo_urls?.length || 0) > 1 && (
                    <div
                      className="photo-strip"
                      aria-label={`${room.name} photos`}
                    >
                      {room.photo_urls!.map((url, i) => (
                        <button
                          key={url}
                          aria-label={`Photo ${i + 1} of ${room.name}`}
                          aria-pressed={(photoIndex[room.id] || 0) === i}
                          onClick={() =>
                            setPhotoIndex({ ...photoIndex, [room.id]: i })
                          }
                        >
                          <img src={url} alt={`${room.name} view ${i + 1}`} />
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="room-content">
                    <div className="eyebrow">WN HOTEL</div>
                    <h3>{room.name}</h3>
                    <p>{room.description}</p>
                    <div className="tags">
                      {room.amenities.map((a) => (
                        <span key={a}>{a}</span>
                      ))}
                    </div>
                    <div className="room-numbers">
                      <span>ROOM NUMBERS</span>
                      <strong>
                        {room.room_numbers?.join(" · ") ||
                          "Contact the hotel for room details"}
                      </strong>
                    </div>
                    {room.available_rooms !== undefined && (
                      <p className="availability">
                        {room.available_rooms === 0
                          ? "Unavailable for these dates"
                          : `${room.available_rooms} rooms available for your stay`}
                      </p>
                    )}
                    <div className="room-bottom">
                      <div>
                        <small>FROM</small>
                        <strong>{money(room.nightly_amount_minor)}</strong>
                        <small>per night · rate subject to your dates</small>
                      </div>
                      <button
                        disabled={busy}
                        aria-expanded={bookingRoom === room.id}
                        onClick={() => {
                          setBookingMessage("");
                          setBookingRoom(room.id);
                          setGuests(Math.min(guests, room.max_guests));
                        }}
                      >
                        Request stay <Icon name="arrow" />
                      </button>
                    </div>
                    {bookingRoom === room.id && (
                      <form
                        ref={bookingPanel}
                        className="booking-inline"
                        aria-label={`Request ${room.name}`}
                        onSubmit={(event) => {
                          event.preventDefault();
                          if (busy) return;
                          setBusy(true);
                          setBookingMessage("");
                          void book(room)
                            .then((done) => {
                              if (done) setBookingRoom(null);
                            })
                            .catch((error) => setBookingMessage(error.message))
                            .finally(() => setBusy(false));
                        }}
                      >
                        <div className="booking-panel-heading">
                          <div>
                            <div className="eyebrow">YOUR NEXT STAY</div>
                            <h3>Make it a date.</h3>
                          </div>
                          <button
                            className="text-button"
                            type="button"
                            onClick={() => setBookingRoom(null)}
                            aria-label="Close booking form"
                          >
                            <Icon name="close" />
                          </button>
                        </div>
                        <p>
                          Choose your dates and send a request for {room.name}.
                        </p>
                        <div className="booking-fields">
                          <label>
                            Check-in
                            <input
                              aria-label="Stay check-in"
                              type="date"
                              required
                              min={today()}
                              value={checkIn}
                              onChange={(event) =>
                                setCheckIn(event.target.value)
                              }
                            />
                          </label>
                          <label>
                            Check-out
                            <input
                              aria-label="Stay check-out"
                              type="date"
                              required
                              min={checkIn || today()}
                              value={checkOut}
                              onChange={(event) =>
                                setCheckOut(event.target.value)
                              }
                            />
                          </label>
                          <label>
                            Guests
                            <select
                              aria-label="Stay guests"
                              value={guests}
                              onChange={(event) =>
                                setGuests(Number(event.target.value))
                              }
                            >
                              {Array.from(
                                { length: room.max_guests },
                                (_, i) => (
                                  <option key={i} value={i + 1}>
                                    {i + 1}
                                  </option>
                                ),
                              )}
                            </select>
                          </label>
                        </div>
                        <div
                          role="alert"
                          className={bookingMessage ? "booking-error" : ""}
                        >
                          {bookingMessage}
                        </div>
                        <small>
                          Your room number is allocated based on availability
                          and shown in My bookings. The hotel reviews your
                          request before confirmation.
                        </small>
                        <button className="booking-submit" disabled={busy}>
                          {busy ? "Sending…" : "Send booking request"}
                          <Icon name="arrow" />
                        </button>
                      </form>
                    )}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
        <section className="stay-note">
          <div className="eyebrow">STAY A LITTLE LONGER</div>
          <h2>
            A room for your plans.
            <br />
            <em>A welcome just for you.</em>
          </h2>
          <a href="#rooms">
            Discover your stay <Icon name="arrow" />
          </a>
        </section>
      </main>
      <footer>
        <a className="brand" href="/">
          WN<span>HOTEL & STAYS</span>
        </a>
        <p>One hotel. A personal welcome.</p>
        <small>Online payments are not enabled.</small>
      </footer>
      {authView && (
        <div className="auth-backdrop" aria-hidden="true" onClick={closeAuth} />
      )}
      <dialog
        ref={dialog}
        className="auth-dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            closeAuth();
            return;
          }
          if (e.key !== "Tab") return;
          const items = Array.from(
            e.currentTarget.querySelectorAll<HTMLElement>(
              'a[href],button:not(:disabled),input:not(:disabled),[tabindex="0"]',
            ),
          ).filter((node) => node.getClientRects().length > 0);
          const first = items[0],
            last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }}
        onCancel={(e) => {
          e.preventDefault();
          closeAuth();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeAuth();
        }}
      >
        <div className="auth-layout">
          <aside className="auth-aside">
            <a className="brand" href="/">
              WN<span>HOTEL & STAYS</span>
            </a>
            <div>
              <div className="eyebrow">YOUR STAY STARTS HERE</div>
              <h2>
                A personal
                <br />
                <em>welcome.</em>
              </h2>
              <p>
                A little comfort. A little calm.
                <br />A place to call yours.
              </p>
            </div>
            <small>One hotel. Thoughtfully yours.</small>
          </aside>
          <div className="auth-main">
            <button
              type="button"
              className="auth-close"
              aria-label="Close login"
              onClick={closeAuth}
            >
              <Icon name="close" />
            </button>
            {(authView === "login" || authView === "signup") && (
              <div
                className="auth-tabs"
                role="tablist"
                aria-label="Account access"
              >
                <button
                  role="tab"
                  aria-selected={authView === "login"}
                  onClick={() => openAuth("login")}
                >
                  Login
                </button>
                <button
                  role="tab"
                  aria-selected={authView === "signup"}
                  onClick={() => openAuth("signup")}
                >
                  Sign up
                </button>
              </div>
            )}
            <h2 id="auth-title">{authTitle}</h2>
            <p className="auth-description">
              {authView === "signup"
                ? "Create your WN account and plan your next stay."
                : authView === "reset"
                  ? "We’ll send you a link to reset your password."
                  : phoneMode
                    ? "Enter a number starting with 09, with exactly 11 digits. No OTP or SMS verification is required."
                    : "Log in to plan your stay and manage your bookings."}
            </p>
            {authView && (
              <div role="status" className={authMessage ? "auth-notice" : ""}>
                {authMessage}
              </div>
            )}
            {!phoneMode ? (
              <form
                className="auth-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void task(submitEmail, true);
                }}
              >
                <label htmlFor="auth-email">Email address</label>
                <input
                  ref={firstInput}
                  id="auth-email"
                  aria-label="Login email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {authView !== "reset" && (
                  <>
                    <div className="password-label">
                      <label htmlFor="auth-password">Password</label>
                      {authView === "login" && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => openAuth("reset")}
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="password-input">
                      <input
                        id="auth-password"
                        aria-label="Login password"
                        type={showPassword ? "text" : "password"}
                        autoComplete={
                          authView === "signup"
                            ? "new-password"
                            : "current-password"
                        }
                        required
                        minLength={authView === "signup" ? 12 : undefined}
                        placeholder={
                          authView === "signup"
                            ? "At least 12 characters"
                            : "Enter your password"
                        }
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        <Icon name="eye" />
                      </button>
                    </div>
                  </>
                )}
                {authView === "signup" && (
                  <label>
                    Phone number
                    <input
                      aria-label="Signup phone"
                      required
                      pattern="09[0-9]{9}"
                      minLength={11}
                      maxLength={11}
                      inputMode="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="09xxxxxxxxx"
                    />
                  </label>
                )}
                {authView === "signup" && (
                  <>
                    <label htmlFor="auth-repeat">Confirm password</label>
                    <input
                      id="auth-repeat"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      placeholder="Enter your password again"
                      value={repeatPassword}
                      onChange={(e) => setRepeatPassword(e.target.value)}
                    />
                  </>
                )}
                <button className="auth-submit" disabled={busy}>
                  {busy
                    ? "Please wait…"
                    : authView === "signup"
                      ? "Create account"
                      : authView === "reset"
                        ? "Send reset link"
                        : "Log in"}
                  <Icon name="arrow" />
                </button>
              </form>
            ) : (
              <form
                className="auth-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void task(savePhone, true);
                }}
              >
                <label htmlFor="auth-phone">Phone number</label>
                <input
                  ref={firstInput}
                  id="auth-phone"
                  aria-label="Phone number"
                  type="tel"
                  autoComplete="tel"
                  required
                  placeholder="09xxxxxxxxx"
                  inputMode="numeric"
                  pattern="09[0-9]{9}"
                  minLength={11}
                  maxLength={11}
                  title="Start with 09 and enter exactly 11 digits"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                  }}
                />
                <button className="auth-submit" disabled={busy}>
                  {busy ? "Saving…" : "Save and continue"}
                  <Icon name="arrow" />
                </button>
              </form>
            )}
            {authView === "contact" ? (
              <button
                className="auth-switch"
                disabled={busy}
                onClick={() =>
                  void task(async () => {
                    await logout();
                    closeAuth();
                  }, true)
                }
              >
                Sign out and finish later
              </button>
            ) : authView === "reset" ? (
              <button className="auth-switch" onClick={() => openAuth("login")}>
                Back to login
              </button>
            ) : (
              <p className="auth-switch">
                {authView === "signup"
                  ? "Already have an account? "
                  : "New to WN? "}
                <button
                  onClick={() =>
                    openAuth(authView === "signup" ? "login" : "signup")
                  }
                >
                  {authView === "signup" ? "Log in" : "Create an account"}
                </button>
              </p>
            )}
            <p className="auth-security">
              Your account connects you to your stay at WN.
            </p>
          </div>
        </div>
      </dialog>
    </>
  );
}
