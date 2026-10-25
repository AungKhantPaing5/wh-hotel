import { runtime, photoAddress } from "./src/runtime";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  RefreshControl,
  Image,
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
import { auth, localTestMode, type Identity } from "./src/auth";
import {
  addDays,
  bookingFingerprint,
  effectiveStatus,
  hotelToday,
  money,
  nights,
  previewRooms,
  validateStay,
  validContactPhone,
  type Booking,
  type Room,
  type Stay,
} from "./src/domain";

const API_URL = runtime.apiUrl;
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
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPressIn={() =>
          Animated.spring(scale, {
            toValue: 0.975,
            useNativeDriver: true,
          }).start()
        }
        onPressOut={() =>
          Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()
        }
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
    </Animated.View>
  );
}
function Field({
  label,
  value,
  onChangeText,
  secure = false,
  keyboardType = "default",
  maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  secure?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad" | "number-pad";
  maxLength?: number;
}) {
  const [hidden, setHidden] = useState(true);
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure && hidden}
        maxLength={maxLength}
        autoCorrect={false}
        autoCapitalize="none"
        keyboardType={keyboardType}
        style={s.input}
      />
      {secure && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={hidden ? "Show password" : "Hide password"}
          onPress={() => setHidden(!hidden)}
        >
          <Text style={s.passwordToggle}>
            {hidden ? "Show password" : "Hide password"}
          </Text>
        </Pressable>
      )}
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
  const [phone, setPhone] = useState("");
  const [accountMode, setAccountMode] = useState<"login" | "signup" | "reset">(
    "login",
  );
  const [confirmPassword, setConfirmPassword] = useState("");
  const [gallery, setGallery] = useState<{ room: Room; index: number } | null>(
    null,
  );
  const selectedRoomRef = useRef<Room | null>(null);
  selectedRoomRef.current = selected;
  const scroll = useRef<ScrollView | null>(null);
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
        }
        uid.current = current?.uid ?? null;
        setUser(current ? { ...current, phone: null } : null);
        if (!current) {
          setAuthReady(true);
          return;
        }
        setAuthReady(false);
        void api
          .profile()
          .then((profile) => {
            if (uid.current !== current.uid) return;
            setUser({ ...current, phone: profile.phone });
            setPhone(profile.phone || "");
            if (profile.needsPhone) setTab("Account");
            else if (selectedRoomRef.current) setTab("Explore");
          })
          .catch((error) => {
            if (uid.current === current.uid) {
              setError(error.message);
              setTab("Account");
            }
          })
          .finally(() => {
            if (uid.current === current.uid) setAuthReady(true);
          });
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
  useEffect(() => {
    if (tab !== "My bookings" || !user || !API_URL) return;
    const timer = setInterval(() => {
      void loadBookings().catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
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
      throw new Error("Add your 11-digit phone number before booking.");
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
          <Text style={s.brand}>WN</Text>
          <Text style={s.eyebrow}>HOTEL & STAYS</Text>
        </View>
        <View style={s.headerBadge}>
          <Text style={s.version}>YOUR PRIVATE ESCAPE</Text>
          <Text style={s.headerBadgeText}>A warm welcome ↗</Text>
        </View>
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={scroll}
          refreshControl={
            <RefreshControl
              refreshing={busy}
              tintColor="#24483a"
              onRefresh={() =>
                void run(async () => {
                  if (tab === "My bookings" && user) await loadBookings();
                  else if (tab === "Explore")
                    await loadRooms(searched || undefined);
                  else if (user) await auth?.refresh();
                })
              }
            />
          }
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.notice}>
            <Text style={s.noticeText}>
              {localTestMode
                ? "LOCAL TEST · No real SMS, social login or money. Use test email accounts."
                : !API_URL
                  ? "PREVIEW · Sample rooms only. Login and booking are disabled."
                  : !auth
                    ? "LIVE ROOMS · Authentication is not configured."
                    : "WN HOTEL · Secure booking requests"}
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
                <Text style={s.heroMark}>WN</Text>
                <Text style={s.kicker}>A STAY THAT FEELS LIKE YOU</Text>
                <Text style={s.title}>
                  {"A little pause.\nA beautiful stay."}
                </Text>
                <Text style={s.heroText}>
                  Thoughtful comforts. A little calm. Your next stay begins
                  right here.
                </Text>
                <Text style={s.heroFootnote}>
                  ONE HOTEL. A PERSONAL WELCOME.
                </Text>
              </View>
              <View style={[s.card, s.searchCard]}>
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
                <Modal
                  animationType="slide"
                  visible
                  onRequestClose={() => setSelected(null)}
                >
                  <SafeAreaView style={s.safe}>
                    <ScrollView
                      contentContainerStyle={s.content}
                      keyboardShouldPersistTaps="handled"
                    >
                      <View style={s.card}>
                        <View style={s.row}>
                          <Text style={s.sheetLabel}>YOUR NEXT STAY</Text>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Close booking review"
                            onPress={() => setSelected(null)}
                          >
                            <Text style={s.closeText}>✕</Text>
                          </Pressable>
                        </View>
                        <DateField
                          label="Stay check-in"
                          value={stay.checkIn}
                          onChange={(date) => {
                            setStay({
                              ...stay,
                              checkIn: date,
                              checkOut:
                                date >= stay.checkOut
                                  ? addDays(date, 1)
                                  : stay.checkOut,
                            });
                            setSearched(null);
                          }}
                        />
                        <DateField
                          label="Stay check-out"
                          value={stay.checkOut}
                          onChange={(date) => {
                            setStay({ ...stay, checkOut: date });
                            setSearched(null);
                          }}
                        />
                        {!!error && (
                          <Text accessibilityRole="alert" style={s.errorText}>
                            {error}
                          </Text>
                        )}

                        <Text style={s.kicker}>REVIEW YOUR REQUEST</Text>
                        <Text style={s.heading}>{selected.name}</Text>
                        <Text style={s.body}>
                          {stay.checkIn} → {stay.checkOut} · {nights(stay)}{" "}
                          nights · {stay.guests} guests
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
                            Sign in and add your phone number in Account before
                            submitting.
                          </Text>
                        )}
                        <Button
                          title="Submit booking request"
                          disabled={busy || !API_URL || !authReady}
                          onPress={() => {
                            if (!user || !user.phone) {
                              setTab("Account");
                              return;
                            }
                            void run(submit);
                          }}
                        />
                        <Button
                          title="Back to rooms"
                          secondary
                          onPress={() => setSelected(null)}
                        />
                      </View>
                    </ScrollView>
                  </SafeAreaView>
                </Modal>
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
                    <View key={room.id} style={[s.card, s.roomCard]}>
                      {room.photo_urls?.[0] ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`View photos of ${room.name}`}
                          onPress={() => setGallery({ room, index: 0 })}
                        >
                          <Image
                            accessibilityLabel={room.name}
                            source={{ uri: photoAddress(room.photo_urls[0]) }}
                            style={{
                              width: "100%",
                              height: 230,
                              borderRadius: 16,
                            }}
                          />
                        </Pressable>
                      ) : (
                        <View style={s.roomArt}>
                          <Text style={s.roomArtText}>
                            WN / {room.name.toUpperCase()}
                          </Text>
                          <View style={s.bed}>
                            <View style={s.pillow} />
                            <View style={s.pillow} />
                          </View>
                          <Text style={s.artCaption}>
                            Room illustration · photos coming soon
                          </Text>
                        </View>
                      )}
                      <Text style={s.roomCategory}>
                        WN COLLECTION · UP TO {room.max_guests} GUESTS
                      </Text>
                      <Text style={s.roomHeading}>{room.name}</Text>
                      {!!room.room_numbers?.length && (
                        <View style={s.numberBadge}>
                          <Text style={s.numberBadgeLabel}>ROOM NUMBERS</Text>
                          <Text style={s.numberBadgeValue}>
                            {room.room_numbers.join(" · ")}
                          </Text>
                        </View>
                      )}
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
                      {booking.room_number && (
                        <Text style={s.roomHeading}>
                          Room {booking.room_number} · {booking.room_type}
                        </Text>
                      )}
                      <Text selectable style={s.muted}>
                        Reference: {booking.id}
                      </Text>
                      <Text style={s.price}>
                        {money(booking.total_amount_minor, booking.currency)}
                      </Text>
                      {booking.expires_at && (
                        <Text style={s.muted}>
                          Hold deadline:{" "}
                          {new Date(booking.expires_at).toLocaleString(
                            "en-GB",
                            { timeZone: "Asia/Yangon" },
                          )}{" "}
                          (Myanmar time)
                        </Text>
                      )}
                      {localTestMode &&
                        effectiveStatus(booking) === "AWAITING_PAYMENT" && (
                          <Button
                            title="Simulate payment — no money"
                            disabled={busy}
                            onPress={() =>
                              void run(async () => {
                                await api.request(
                                  `local-test/bookings/${booking.id}/pay`,
                                  { method: "POST", authenticated: true },
                                );
                                await loadBookings();
                              })
                            }
                          />
                        )}
                      {effectiveStatus(booking) === "AWAITING_PAYMENT" && (
                        <Text style={s.warning}>
                          The hotel accepted this request. Online payment is not
                          available in this version. Contact WN; do not assume
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
                Your stays, your details. Everything you need, right here.
              </Text>
              {!auth ? (
                <View style={s.card}>
                  <Text style={s.body}>
                    Authentication is disabled in this preview. Configure
                    Firebase and install a native development build to test
                    email and social login.
                  </Text>
                </View>
              ) : (
                <>
                  {!authReady && <ActivityIndicator />}
                  {user ? (
                    <View style={s.card}>
                      <Text style={s.heading}>
                        {user.email || user.phone || "WN Guest"}
                      </Text>
                      <Text style={s.body}>
                        Phone: {user.phone || "Add your number below"}
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
                          Add your phone number to finish setting up your
                          account. No OTP is required.
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

                            setPhone("");
                            setEmail("");
                          })
                        }
                      />
                    </View>
                  ) : (
                    <View style={[s.card, s.authCard]}>
                      <View style={s.authTabs}>
                        {(["login", "signup"] as const).map((mode) => (
                          <Pressable
                            key={mode}
                            accessibilityRole="tab"
                            accessibilityState={{
                              selected: accountMode === mode,
                            }}
                            style={[
                              s.authTab,
                              accountMode === mode && s.authTabActive,
                            ]}
                            onPress={() => {
                              setAccountMode(mode);
                              setError("");
                              setPassword("");
                              setConfirmPassword("");
                            }}
                          >
                            <Text
                              style={[
                                s.authTabText,
                                accountMode === mode && s.authTabTextActive,
                              ]}
                            >
                              {mode === "login" ? "Login" : "Sign up"}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      <Text style={s.authTitle}>
                        {accountMode === "signup"
                          ? "Make yourself at home"
                          : accountMode === "reset"
                            ? "Forgot your password?"
                            : "Welcome back"}
                      </Text>
                      <Text style={s.muted}>
                        {accountMode === "signup"
                          ? "A personal welcome starts with your WN account."
                          : "Plan your stay and manage your bookings in the app."}
                      </Text>
                      <Field
                        label="Email address"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                      />
                      {accountMode !== "reset" && (
                        <Field
                          label="Password"
                          value={password}
                          onChangeText={setPassword}
                          secure
                        />
                      )}
                      {accountMode === "signup" && (
                        <Field
                          label="Confirm password"
                          value={confirmPassword}
                          onChangeText={setConfirmPassword}
                          secure
                        />
                      )}
                      <Button
                        title={
                          busy
                            ? "Please wait…"
                            : accountMode === "signup"
                              ? "Create account →"
                              : accountMode === "reset"
                                ? "Send reset email"
                                : "Log in →"
                        }
                        disabled={busy || !authReady}
                        onPress={() =>
                          void run(async () => {
                            if (accountMode === "reset") {
                              await auth!.reset(email);
                              Alert.alert(
                                "Check your inbox",
                                "Follow the password-reset email from WN.",
                              );
                              return;
                            }
                            if (
                              accountMode === "signup" &&
                              (password.length < 6 ||
                                password !== confirmPassword)
                            )
                              throw new Error(
                                "Use at least 6 characters and matching passwords.",
                              );
                            await auth!.email(
                              email.trim(),
                              password,
                              accountMode === "signup",
                            );
                            setPassword("");
                            setConfirmPassword("");
                          })
                        }
                      />
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          setAccountMode(
                            accountMode === "reset" ? "login" : "reset",
                          );
                          setError("");
                        }}
                      >
                        <Text style={s.authLink}>
                          {accountMode === "reset"
                            ? "Back to login"
                            : "Forgot password?"}
                        </Text>
                      </Pressable>
                      {accountMode !== "reset" && (
                        <>
                          <Text style={s.divider}>OR CONTINUE WITH</Text>
                          <Button
                            title="Continue with Google"
                            secondary
                            disabled={busy || !authReady}
                            onPress={() => void run(() => auth!.google())}
                          />
                          <Button
                            title="Continue with Apple"
                            secondary
                            disabled={busy || !authReady}
                            onPress={() => void run(() => auth!.apple())}
                          />
                        </>
                      )}
                      <Text style={s.authFinePrint}>
                        Your account connects you to your stay at WN.
                      </Text>
                    </View>
                  )}
                  {user && !user.phone && (
                    <View style={[s.card, s.contactCard]}>
                      <Text style={s.kicker}>ONE LAST THING</Text>
                      <Text style={s.authTitle}>Your phone number</Text>
                      <Text style={s.body}>
                        Start with 09 and enter exactly 11 digits. No SMS or OTP
                        is required.
                      </Text>
                      <Field
                        label="Phone number"
                        value={phone}
                        onChangeText={setPhone}
                        keyboardType="phone-pad"
                        maxLength={11}
                      />
                      <Button
                        title="Save and continue →"
                        disabled={busy || !authReady}
                        onPress={() =>
                          void run(async () => {
                            if (!validContactPhone(phone))
                              throw new Error(
                                "Start with 09 and enter exactly 11 digits.",
                              );
                            await api.saveContact(phone);
                            const profile = await api.profile();
                            if (uid.current !== user.uid) return;
                            setUser({ ...user, phone: profile.phone });
                            setTab(
                              selectedRoomRef.current
                                ? "Explore"
                                : "My bookings",
                            );
                          })
                        }
                      />
                    </View>
                  )}
                </>
              )}
            </>
          )}
          <Text style={s.footer}>
            {
              "WN HOTEL · A PERSONAL WELCOME\nOnline payments and store releases are not enabled."
            }
          </Text>
        </ScrollView>
        <Modal
          visible={!!gallery}
          animationType="fade"
          onRequestClose={() => setGallery(null)}
        >
          <SafeAreaView style={s.gallerySafe}>
            <StatusBar style="light" />
            <View style={s.galleryHeader}>
              <Text style={s.galleryTitle}>{gallery?.room.name}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close photos"
                onPress={() => setGallery(null)}
              >
                <Text style={s.galleryClose}>✕</Text>
              </Pressable>
            </View>
            {gallery && (
              <Image
                source={{
                  uri: photoAddress(gallery.room.photo_urls![gallery.index]!),
                }}
                style={s.galleryImage}
                resizeMode="contain"
              />
            )}
            {gallery && (
              <View style={s.galleryControls}>
                <Button
                  title="Previous"
                  secondary
                  disabled={gallery.index === 0}
                  onPress={() =>
                    setGallery({ ...gallery, index: gallery.index - 1 })
                  }
                />
                <Text style={s.galleryCount}>
                  {gallery.index + 1} / {gallery.room.photo_urls?.length}
                </Text>
                <Button
                  title="Next"
                  secondary
                  disabled={
                    gallery.index + 1 === (gallery.room.photo_urls?.length || 0)
                  }
                  onPress={() =>
                    setGallery({ ...gallery, index: gallery.index + 1 })
                  }
                />
              </View>
            )}
          </SafeAreaView>
        </Modal>
      </KeyboardAvoidingView>
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
              <Text style={s.navIcon}>
                {item === "Explore" ? "⌂" : item === "My bookings" ? "▤" : "◉"}
                {"\n"}
              </Text>
              {item === "Account" && !user ? "Login" : item}
            </Text>
          </Pressable>
        ))}
      </View>
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
  passwordToggle: {
    alignSelf: "flex-end",
    fontSize: 11,
    color: "#6b7b60",
    paddingVertical: 3,
  },
  headerBadge: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: "#e9ede2",
    borderRadius: 12,
    gap: 3,
  },
  headerBadgeText: { fontSize: 12, fontWeight: "600", color: "#3b5945" },
  navIcon: { fontSize: 22, lineHeight: 28 },
  heroMark: {
    position: "absolute",
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 190,
    color: "#ffffff08",
    right: -12,
    bottom: -35,
  },
  heroFootnote: {
    color: "#c6c9ad",
    letterSpacing: 1.5,
    fontSize: 8,
    marginTop: 12,
  },
  searchCard: {
    marginTop: -28,
    marginHorizontal: 10,
    shadowColor: "#24483a",
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  roomCard: {
    shadowColor: "#24483a",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 7 },
    elevation: 4,
  },
  roomCategory: {
    fontSize: 9,
    letterSpacing: 1.4,
    color: "#8a927d",
    fontWeight: "600",
  },
  roomHeading: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 27,
    color: "#24483a",
  },
  numberBadge: {
    padding: 13,
    backgroundColor: "#f0f3e9",
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  numberBadgeLabel: { fontSize: 9, color: "#849074", letterSpacing: 1 },
  numberBadgeValue: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4f6548",
    flex: 1,
    textAlign: "right",
  },
  authCard: {
    padding: 25,
    shadowColor: "#24483a",
    shadowOpacity: 0.06,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  authTabs: {
    flexDirection: "row",
    gap: 25,
    borderBottomWidth: 1,
    borderColor: "#e5e9df",
    marginBottom: 5,
  },
  authTab: {
    paddingBottom: 13,
    borderBottomWidth: 2,
    borderColor: "transparent",
  },
  authTabActive: { borderColor: "#24483a" },
  authTabText: { fontSize: 13, color: "#939c8e" },
  authTabTextActive: { color: "#24483a", fontWeight: "600" },
  authTitle: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 31,
    color: "#24483a",
    lineHeight: 38,
  },
  authLink: {
    textAlign: "center",
    fontSize: 12,
    color: "#76896a",
    paddingVertical: 8,
  },
  divider: {
    fontSize: 9,
    letterSpacing: 1.8,
    color: "#99a18e",
    textAlign: "center",
    marginTop: 14,
  },
  authFinePrint: {
    fontSize: 10,
    lineHeight: 18,
    color: "#9aa18f",
    textAlign: "center",
    marginTop: 10,
  },
  contactCard: {
    backgroundColor: "#edf2e5",
    borderColor: "#d5dec8",
    padding: 25,
  },
  sheetLabel: {
    fontSize: 10,
    letterSpacing: 2,
    color: "#879372",
    flex: 1,
    marginTop: 5,
  },
  closeText: { fontSize: 22, color: "#6f7d64", padding: 4 },
  gallerySafe: { flex: 1, backgroundColor: "#18382f" },
  galleryHeader: {
    padding: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  galleryTitle: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 24,
    color: "#f7f0dc",
    flex: 1,
  },
  galleryClose: { color: "#fff", fontSize: 24, padding: 6 },
  galleryImage: { width: "100%", flex: 1 },
  galleryControls: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 24,
  },
  galleryCount: { fontSize: 12, color: "#d9e1cd" },
  safe: { flex: 1, backgroundColor: "#f5f4ef" },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brand: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 39,
    fontWeight: "700",
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
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    marginHorizontal: 12,
    marginBottom: 8,
    backgroundColor: "#fff",
    borderRadius: 22,
    shadowColor: "#193c2e",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 3 },
    elevation: 10,
  },
  tab: { flex: 1, padding: 10, alignItems: "center", borderRadius: 16 },
  activeTab: { backgroundColor: "#eaf0e1" },
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
  hero: {
    backgroundColor: "#24483a",
    padding: 29,
    paddingBottom: 48,
    borderRadius: 25,
    gap: 16,
    overflow: "hidden",
  },
  kicker: {
    color: "#718450",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  title: {
    color: "#f6f0dc",
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 38,
    lineHeight: 45,
  },
  heroText: { color: "#d9e4d6", lineHeight: 22 },
  titleDark: {
    color: "#24483a",
    fontSize: 34,
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 22,
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
    backgroundColor: "#24483a",
    borderRadius: 13,
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
