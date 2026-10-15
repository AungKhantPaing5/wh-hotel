import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { StatusBar } from "expo-status-bar";
import { WhApi } from "./src/api";
import { auth, type Identity } from "./src/auth";
import {
  addDays,
  bookingFingerprint,
  effectiveStatus,
  hotelToday,
  money,
  nights,
  previewRooms,
  validateStay,
  type Booking,
  type Room,
  type Stay,
} from "./src/domain";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "";
type Tab = "Explore" | "My bookings" | "Account";
function Button({
  title,
  onPress,
  disabled = false,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[s.button, secondary && s.secondary, disabled && s.disabled]}
    >
      <Text style={[s.buttonText, secondary && { color: "#174b3f" }]}>
        {title}
      </Text>
    </Pressable>
  );
}
function Field({
  label,
  value,
  onChangeText,
  secure = false,
  keyboardType = "default",
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  secure?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad" | "number-pad";
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        autoCapitalize="none"
        keyboardType={keyboardType}
        style={s.input}
      />
    </View>
  );
}
function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const date = new Date(`${value}T12:00:00`);
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <Button title={value} secondary onPress={() => setOpen(true)} />
      {open && (
        <>
          <DateTimePicker
            value={date}
            mode="date"
            minimumDate={new Date(`${hotelToday()}T00:00:00`)}
            onChange={(event, chosen) => {
              if (Platform.OS === "android") setOpen(false);
              if (chosen && event.type !== "dismissed")
                onChange(
                  `${chosen.getFullYear()}-${String(chosen.getMonth() + 1).padStart(2, "0")}-${String(chosen.getDate()).padStart(2, "0")}`,
                );
            }}
          />
          {Platform.OS === "ios" && (
            <Button title="Done" secondary onPress={() => setOpen(false)} />
          )}
        </>
      )}
    </View>
  );
}
function Main() {
  const [tab, setTab] = useState<Tab>("Explore");
  const [user, setUser] = useState<Identity | null>(null);
  const uid = useRef<string | null>(null);
  const [authReady, setAuthReady] = useState(!auth);
  const [rooms, setRooms] = useState<Room[]>(API_URL ? [] : previewRooms);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [stay, setStay] = useState<Stay>({
    checkIn: hotelToday(),
    checkOut: addDays(hotelToday(), 1),
    guests: 2,
  });
  const [searched, setSearched] = useState<Stay | null>(null);
  const [selected, setSelected] = useState<Room | null>(null);
  const [receipt, setReceipt] = useState<Booking | null>(null);
  const [busy, setBusy] = useState(false),
    locked = useRef(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const [phone, setPhone] = useState(""),
    [code, setCode] = useState(""),
    [smsSent, setSmsSent] = useState(false);
  const api = useMemo(
    () => new WhApi(API_URL, () => auth?.token() ?? Promise.resolve(null)),
    [],
  );
  const roomGeneration = useRef(0),
    bookingGeneration = useRef(0);
  useEffect(
    () =>
      auth?.subscribe((current) => {
        if (uid.current !== (current?.uid ?? null)) {
          bookingGeneration.current++;
          setBookings([]);
          setReceipt(null);
          setSmsSent(false);
          setCode("");
        }
        uid.current = current?.uid ?? null;
        setUser(current);
        setAuthReady(true);
      }),
    [],
  );
  const run = async (action: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Something went wrong. Try again.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  async function loadRooms(search?: Stay) {
    const generation = ++roomGeneration.current;
    const result = API_URL ? await api.rooms(search) : previewRooms;
    if (generation === roomGeneration.current) {
      setRooms(result);
      setSearched(search ?? null);
    }
  }
  async function loadBookings() {
    const owner = uid.current,
      generation = ++bookingGeneration.current;
    const result = await api.bookings();
    if (uid.current === owner && generation === bookingGeneration.current)
      setBookings(result);
  }
  useEffect(() => {
    if (API_URL) void run(() => loadRooms());
  }, []);
  useEffect(() => {
    if (tab === "My bookings" && user && API_URL) void run(loadBookings);
  }, [tab, user?.uid]);
  // Refresh display of expired holds even when the guest leaves the screen open.
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(timer);
  }, []);
  function editStay(next: Stay) {
    setStay(next);
    setSearched(null);
    setSelected(null);
    setReceipt(null);
  }
  async function submit() {
    if (!selected || !user || !auth || !API_URL)
      throw new Error("Configure the API and sign in before booking.");
    if (!user.phone) {
      setTab("Account");
      throw new Error("Verify your phone number before booking.");
    }
    const validation = validateStay(stay);
    if (validation) throw new Error(validation);
    if (stay.guests > selected.max_guests)
      throw new Error("This room cannot accommodate your guest count.");
    const owner = user.uid,
      room = selected,
      requestStay = { ...stay };
    const fingerprint = bookingFingerprint(owner, room, requestStay);
    const storageKey =
      "wh.booking." +
      (await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        fingerprint,
      ));
    // Persist before sending. An uncertain network response must reuse this key.
    const raw = await SecureStore.getItemAsync(storageKey);
    let previous: { fingerprint: string; key: string } | null = null;
    try {
      previous = raw ? JSON.parse(raw) : null;
    } catch {
      throw new Error(
        "Saved booking retry data is unreadable. Contact support before making another request.",
      );
    }
    const key =
      previous?.fingerprint === fingerprint
        ? previous.key
        : Crypto.randomUUID();
    await SecureStore.setItemAsync(
      storageKey,
      JSON.stringify({ fingerprint, key }),
    );
    if (uid.current !== owner)
      throw new Error("Account changed. Review your request again.");
    const result = await api.book(room, requestStay, key);
    if (uid.current !== owner) return;
    if (
      ["EXPIRED", "REJECTED", "CANCELLED"].includes(effectiveStatus(result))
    ) {
      await SecureStore.deleteItemAsync(storageKey);
      throw new Error(
        "The earlier request is closed. Search availability and submit a new request.",
      );
    }
    setReceipt(result);
    setSelected(null);
    // Keep successful request key too: repeated taps for the same stay return the same booking.
    await loadBookings();
  }
  const searchValid =
    searched && JSON.stringify(searched) === JSON.stringify(stay);
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <View>
          <Text style={s.brand}>WH</Text>
          <Text style={s.eyebrow}>YOUR STAY, SIMPLY BETTER</Text>
        </View>
        <Text style={s.version}>HOTEL · v0.3</Text>
      </View>
      <View style={s.tabs}>
        {(["Explore", "My bookings", "Account"] as Tab[]).map((item) => (
          <Pressable
            key={item}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === item }}
            onPress={() => {
              setTab(item);
              setError("");
            }}
            style={[s.tab, tab === item && s.activeTab]}
          >
            <Text
              style={[
                s.tabText,
                tab === item && { color: "#174b3f", fontWeight: "700" },
              ]}
            >
              {item}
            </Text>
          </Pressable>
        ))}
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.notice}>
            <Text style={s.noticeText}>
              {!API_URL
                ? "PREVIEW · Sample rooms only. Login and booking are disabled."
                : !auth
                  ? "LIVE ROOMS · Authentication is not configured."
                  : "WH HOTEL · Secure booking requests"}
            </Text>
          </View>
          {!!error && (
            <View accessibilityRole="alert" style={s.error}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}
          {busy && (
            <ActivityIndicator accessibilityLabel="Loading" color="#174b3f" />
          )}
          {tab === "Explore" && (
            <>
              <View style={s.hero}>
                <Text style={s.kicker}>WELCOME TO WH</Text>
                <Text style={s.title}>
                  {"A little escape.\nA memorable stay."}
                </Text>
                <Text style={s.heroText}>
                  Find your room and let us take care of the rest.
                </Text>
              </View>
              <View style={s.card}>
                <Text style={s.heading}>Plan your stay</Text>
                <View style={s.row}>
                  <DateField
                    label="Check-in"
                    value={stay.checkIn}
                    onChange={(checkIn) =>
                      editStay({
                        ...stay,
                        checkIn,
                        checkOut:
                          checkIn >= stay.checkOut
                            ? addDays(checkIn, 1)
                            : stay.checkOut,
                      })
                    }
                  />
                  <DateField
                    label="Check-out"
                    value={stay.checkOut}
                    onChange={(checkOut) => editStay({ ...stay, checkOut })}
                  />
                </View>
                <View style={[s.row, { alignItems: "center" }]}>
                  <Text style={s.body}>Guests</Text>
                  <Button
                    title="−"
                    secondary
                    disabled={stay.guests <= 1 || busy}
                    onPress={() =>
                      editStay({ ...stay, guests: stay.guests - 1 })
                    }
                  />
                  <Text style={s.heading}>{stay.guests}</Text>
                  <Button
                    title="+"
                    secondary
                    disabled={stay.guests >= 4 || busy}
                    onPress={() =>
                      editStay({ ...stay, guests: stay.guests + 1 })
                    }
                  />
                </View>
                <Button
                  title="Search available rooms"
                  disabled={busy}
                  onPress={() =>
                    void run(async () => {
                      const issue = validateStay(stay);
                      if (issue) throw new Error(issue);
                      setSelected(null);
                      setReceipt(null);
                      await loadRooms({ ...stay });
                    })
                  }
                />
              </View>
              {receipt && (
                <View style={s.card}>
                  <Text style={s.heading}>Request received</Text>
                  <Text selectable style={s.body}>
                    Reference: {receipt.id}
                  </Text>
                  <Text style={s.body}>
                    Server total:{" "}
                    {money(receipt.total_amount_minor, receipt.currency)}
                  </Text>
                  <Text style={s.body}>
                    Status: {effectiveStatus(receipt).replaceAll("_", " ")}
                  </Text>
                  <Text style={s.muted}>
                    This is a request, not a confirmed reservation. No payment
                    was collected.
                  </Text>
                  <Button
                    title="View My bookings"
                    onPress={() => setTab("My bookings")}
                  />
                </View>
              )}
              {selected ? (
                <View style={s.card}>
                  <Text style={s.kicker}>REVIEW YOUR REQUEST</Text>
                  <Text style={s.heading}>{selected.name}</Text>
                  <Text style={s.body}>
                    {stay.checkIn} → {stay.checkOut} · {nights(stay)} nights ·{" "}
                    {stay.guests} guests
                  </Text>
                  <Text style={s.price}>
                    {money(
                      (
                        BigInt(selected.nightly_amount_minor) *
                        BigInt(nights(stay))
                      ).toString(),
                      selected.currency,
                    )}
                  </Text>
                  <Text style={s.muted}>
                    Estimate only. The server calculates the final total.
                    Requests are held up to 30 minutes for hotel approval.
                    Payment integration is not enabled yet.
                  </Text>
                  {!user?.phone && (
                    <Text style={s.warning}>
                      Sign in and verify your phone in Account before
                      submitting.
                    </Text>
                  )}
                  <Button
                    title="Submit booking request"
                    disabled={busy || !API_URL || !user?.phone || !authReady}
                    onPress={() => void run(submit)}
                  />
                  <Button
                    title="Back to rooms"
                    secondary
                    onPress={() => setSelected(null)}
                  />
                </View>
              ) : (
                <>
                  <Text style={s.heading}>
                    {searchValid ? "Rooms for your stay" : "Discover our rooms"}
                  </Text>
                  {rooms.length === 0 && !busy && (
                    <Text style={s.muted}>
                      No rooms to display. Try searching again.
                    </Text>
                  )}
                  {rooms.map((room) => (
                    <View key={room.id} style={s.card}>
                      <View style={s.roomArt}>
                        <Text style={s.roomArtText}>
                          WH / {room.name.toUpperCase()}
                        </Text>
                        <View style={s.bed}>
                          <View style={s.pillow} />
                          <View style={s.pillow} />
                        </View>
                        <Text style={s.artCaption}>
                          Room illustration · photos coming soon
                        </Text>
                      </View>
                      <Text style={s.heading}>{room.name}</Text>
                      <Text style={s.body}>{room.description}</Text>
                      <Text style={s.muted}>
                        Up to {room.max_guests} guests ·{" "}
                        {room.amenities.join(" · ")}
                      </Text>
                      <Text style={s.price}>
                        {money(room.nightly_amount_minor, room.currency)}
                        <Text style={s.muted}> / night</Text>
                      </Text>
                      {searchValid && API_URL && (
                        <Text style={s.body}>
                          {room.available_rooms ?? "Unknown"} rooms available
                        </Text>
                      )}
                      <Button
                        title={
                          stay.guests > room.max_guests
                            ? "Choose a larger room"
                            : searchValid && room.available_rooms === 0
                              ? "Sold out"
                              : "Review this room"
                        }
                        disabled={
                          busy ||
                          stay.guests > room.max_guests ||
                          Boolean(searchValid && room.available_rooms === 0)
                        }
                        onPress={() =>
                          void run(async () => {
                            const issue = validateStay(stay);
                            if (issue) throw new Error(issue);
                            setSelected(room);
                            setReceipt(null);
                          })
                        }
                      />
                    </View>
                  ))}
                </>
              )}
            </>
          )}
          {tab === "My bookings" && (
            <>
              <Text style={s.titleDark}>Your stays</Text>
              <Text style={s.muted}>
                Booking requests and the latest hotel status.
              </Text>
              {!user ? (
                <Button
                  title="Sign in to view bookings"
                  onPress={() => setTab("Account")}
                />
              ) : (
                <>
                  <Button
                    title="Refresh bookings"
                    disabled={busy || !API_URL}
                    onPress={() => void run(loadBookings)}
                    secondary
                  />
                  {!bookings.length && !busy && (
                    <Text style={s.body}>No bookings loaded.</Text>
                  )}
                  {bookings.map((booking) => (
                    <View style={s.card} key={booking.id}>
                      <Text style={s.kicker}>
                        {effectiveStatus(booking).replaceAll("_", " ")}
                      </Text>
                      <Text style={s.heading}>
                        {booking.check_in.slice(0, 10)} →{" "}
                        {booking.check_out.slice(0, 10)}
                      </Text>
                      <Text selectable style={s.muted}>
                        Reference: {booking.id}
                      </Text>
                      <Text style={s.price}>
                        {money(booking.total_amount_minor, booking.currency)}
                      </Text>
                      {booking.expires_at && (
                        <Text style={s.muted}>
                          Hold deadline:{" "}
                          {new Date(booking.expires_at).toLocaleString()}
                        </Text>
                      )}
                      {effectiveStatus(booking) === "AWAITING_PAYMENT" && (
                        <Text style={s.warning}>
                          The hotel accepted this request. Online payment is not
                          available in this version. Contact WH; do not assume
                          the reservation is confirmed.
                        </Text>
                      )}
                    </View>
                  ))}
                </>
              )}
            </>
          )}
          {tab === "Account" && (
            <>
              <Text style={s.titleDark}>
                {user ? "Your account" : "Welcome back"}
              </Text>
              <Text style={s.muted}>
                Use the same WH account on the website and app.
              </Text>
              {!auth ? (
                <View style={s.card}>
                  <Text style={s.body}>
                    Authentication is disabled in this preview. Configure
                    Firebase and install a native development build to test
                    Google, Apple and phone login.
                  </Text>
                </View>
              ) : (
                <>
                  {!authReady && <ActivityIndicator />}
                  {user ? (
                    <View style={s.card}>
                      <Text style={s.heading}>
                        {user.email || user.phone || "WH Guest"}
                      </Text>
                      <Text style={s.body}>
                        Phone: {user.phone || "Not verified"}
                      </Text>
                      <Text style={s.body}>
                        Email:{" "}
                        {user.email
                          ? user.emailVerified
                            ? "Verified"
                            : "Verification needed"
                          : "Add an email below"}
                      </Text>
                      {!user.phone && (
                        <Text style={s.warning}>
                          Add and verify your phone number before booking.
                        </Text>
                      )}
                      {!user.email && (
                        <>
                          <Text style={s.warning}>
                            Complete your account: add an email and password,
                            then verify your email.
                          </Text>
                          <Field
                            label="Email"
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                          />
                          <Field
                            label="New password"
                            value={password}
                            onChangeText={setPassword}
                            secure
                          />
                          <Button
                            title="Link email and send verification"
                            disabled={busy}
                            onPress={() =>
                              void run(async () => {
                                await auth!.addEmail(email, password);
                                setPassword("");
                                Alert.alert(
                                  "Check your inbox",
                                  "Open the verification link, then refresh your account.",
                                );
                              })
                            }
                          />
                        </>
                      )}
                      {user.email && !user.emailVerified && (
                        <Button
                          title="Send verification email"
                          secondary
                          disabled={busy}
                          onPress={() =>
                            void run(async () => {
                              await auth!.verifyEmail();
                              Alert.alert("Verification email sent");
                            })
                          }
                        />
                      )}
                      <Button
                        title="Refresh verification status"
                        secondary
                        disabled={busy}
                        onPress={() => void run(() => auth!.refresh())}
                      />
                      <Button
                        title="Sign out"
                        secondary
                        disabled={busy}
                        onPress={() =>
                          void run(async () => {
                            await auth!.signOut();
                            setPassword("");
                            setCode("");
                            setPhone("");
                            setEmail("");
                          })
                        }
                      />
                    </View>
                  ) : (
                    <View style={s.card}>
                      <Button
                        title="Continue with Google"
                        disabled={busy || !authReady}
                        onPress={() => void run(() => auth!.google())}
                      />
                      <Button
                        title="Continue with Apple"
                        secondary
                        disabled={busy || !authReady}
                        onPress={() => void run(() => auth!.apple())}
                      />
                      <Text style={s.heading}>Or use email</Text>
                      <Field
                        label="Email"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                      />
                      <Field
                        label="Password"
                        value={password}
                        onChangeText={setPassword}
                        secure
                      />
                      <Button
                        title="Sign in"
                        disabled={busy || !authReady}
                        onPress={() =>
                          void run(async () => {
                            await auth!.email(email, password, false);
                            setPassword("");
                          })
                        }
                      />
                      <Button
                        title="Create email account"
                        secondary
                        disabled={busy || !authReady}
                        onPress={() =>
                          void run(async () => {
                            await auth!.email(email, password, true);
                            setPassword("");
                          })
                        }
                      />
                      <Button
                        title="Forgot password"
                        secondary
                        disabled={busy}
                        onPress={() =>
                          void run(async () => {
                            await auth!.reset(email);
                            Alert.alert(
                              "Password reset",
                              "If this account exists, check your email for reset instructions.",
                            );
                          })
                        }
                      />
                    </View>
                  )}
                  {(!user || !user.phone) && (
                    <View style={s.card}>
                      <Text style={s.heading}>
                        {user ? "Verify your phone" : "Or sign in with phone"}
                      </Text>
                      <Field
                        label="Phone (+country code)"
                        value={phone}
                        onChangeText={(value) => {
                          setPhone(value);
                          setSmsSent(false);
                          setCode("");
                        }}
                        keyboardType="phone-pad"
                      />
                      <Text style={s.muted}>
                        SMS verification uses Firebase. Standard messaging rates
                        may apply.
                      </Text>
                      <Button
                        title={smsSent ? "Send a new code" : "Send SMS code"}
                        disabled={busy || !authReady}
                        onPress={() =>
                          void run(async () => {
                            await auth!.sendPhone(phone.trim(), !!user);
                            setSmsSent(true);
                          })
                        }
                      />
                      {smsSent && (
                        <>
                          <Field
                            label="6-digit SMS code"
                            value={code}
                            onChangeText={setCode}
                            keyboardType="number-pad"
                          />
                          <Button
                            title="Verify code"
                            disabled={busy}
                            onPress={() =>
                              void run(async () => {
                                await auth!.confirmPhone(code.trim());
                                setCode("");
                                setSmsSent(false);
                              })
                            }
                          />
                        </>
                      )}
                    </View>
                  )}
                </>
              )}
            </>
          )}
          <Text style={s.footer}>
            {
              "WH HOTEL · Booking MVP\nOnline payments and store releases are not enabled."
            }
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f5f4ef" },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brand: {
    fontSize: 34,
    fontWeight: "800",
    color: "#174b3f",
    letterSpacing: -2,
  },
  eyebrow: {
    fontSize: 9,
    letterSpacing: 1.5,
    color: "#6e7c72",
    fontWeight: "700",
  },
  version: { fontSize: 11, color: "#7d857f", letterSpacing: 1 },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: "#e1e4dc",
  },
  tab: { flex: 1, padding: 14, alignItems: "center" },
  activeTab: { borderBottomWidth: 3, borderColor: "#174b3f" },
  tabText: { color: "#7b837d", fontSize: 13 },
  content: {
    padding: 20,
    gap: 16,
    maxWidth: 740,
    width: "100%",
    alignSelf: "center",
    paddingBottom: 48,
  },
  notice: { padding: 12, backgroundColor: "#e5eee5", borderRadius: 10 },
  noticeText: { color: "#315442", fontSize: 12, lineHeight: 18 },
  error: { padding: 14, borderRadius: 10, backgroundColor: "#fce9e5" },
  errorText: { color: "#8f3122", lineHeight: 22 },
  hero: { backgroundColor: "#174b3f", padding: 24, borderRadius: 22, gap: 14 },
  kicker: {
    color: "#718450",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  title: { color: "#fff", fontSize: 32, lineHeight: 40, fontWeight: "700" },
  heroText: { color: "#d9e4d6", lineHeight: 22 },
  titleDark: { color: "#173e33", fontSize: 30, fontWeight: "700" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 20,
    gap: 14,
    borderWidth: 1,
    borderColor: "#e6e6de",
  },
  heading: { fontSize: 19, fontWeight: "700", color: "#213e32" },
  body: { fontSize: 14, lineHeight: 23, color: "#394a40" },
  muted: { fontSize: 12, lineHeight: 20, color: "#718075" },
  warning: { color: "#936015", fontSize: 13, lineHeight: 22 },
  row: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  field: { flexGrow: 1, gap: 8, minWidth: 110 },
  label: { fontSize: 12, fontWeight: "600", color: "#526458" },
  input: {
    borderWidth: 1,
    borderColor: "#d6ddd2",
    borderRadius: 10,
    padding: 13,
    fontSize: 15,
    color: "#213e32",
    backgroundColor: "#fafbf8",
  },
  button: {
    backgroundColor: "#174b3f",
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
  },
  buttonText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  secondary: { backgroundColor: "#edf2e9" },
  disabled: { opacity: 0.45 },
  price: { fontSize: 21, fontWeight: "700", color: "#174b3f" },
  footer: {
    textAlign: "center",
    color: "#849083",
    fontSize: 11,
    lineHeight: 19,
    marginTop: 18,
  },
  roomArt: {
    height: 150,
    backgroundColor: "#dce3d1",
    borderRadius: 12,
    padding: 16,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  roomArtText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#55664e",
    letterSpacing: 1,
  },
  bed: {
    height: 64,
    width: "75%",
    backgroundColor: "#fbfaf2",
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    alignSelf: "center",
    borderBottomWidth: 12,
    borderColor: "#9da88b",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    padding: 8,
  },
  pillow: {
    width: "34%",
    height: 25,
    borderRadius: 5,
    backgroundColor: "#e2d9c3",
  },
  artCaption: { fontSize: 10, color: "#64715a", textAlign: "center" },
});
