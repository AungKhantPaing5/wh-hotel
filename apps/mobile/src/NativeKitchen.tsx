import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  TextInput,
  StyleSheet,
} from "react-native";
import * as Crypto from "expo-crypto";
import type { WhApi } from "./api";
import type { Identity } from "./auth";
import type { Booking } from "./domain";
import { money } from "./domain";
import { photoAddress } from "./runtime";
export function NativeKitchen({
  api,
  user,
  bookings,
  refreshBookings,
  onLogin,
}: {
  api: WhApi;
  user: Identity | null;
  bookings: Booking[];
  refreshBookings: () => Promise<void>;
  onLogin: () => void;
}) {
  const [menu, setMenu] = useState<any[]>([]),
    [orders, setOrders] = useState<any[]>([]),
    [cart, setCart] = useState<Record<number, number>>({}),
    [note, setNote] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState("");
  const pending = useRef<{ fingerprint: string; key: string } | null>(null),
    lock = useRef(false);
  const active = bookings.filter(
      (b) => b.status === "CONFIRMED" && b.checked_in_at && !b.checked_out_at,
    ),
    bookingId = active.find((b) => b.id === selected)?.id || active[0]?.id;
  async function refresh() {
    setMenu(await api.request<any[]>("kitchen/menu"));
    if (user) {
      await refreshBookings();
      setOrders(
        await api.request<any[]>("kitchen/orders", { authenticated: true }),
      );
    }
  }
  useEffect(() => {
    void refresh().catch((e) => setMessage(e.message));
    const t = setInterval(() => void refresh().catch(() => {}), 15000);
    return () => clearInterval(t);
  }, [user?.uid]);
  async function order() {
    if (lock.current) return;
    const items = Object.entries(cart)
      .filter(([, q]) => q > 0)
      .map(([id, quantity]) => ({ dishId: Number(id), quantity }));
    if (!bookingId || !items.length) {
      setMessage("Check in with hotel staff and choose a dish first.");
      return;
    }
    const fingerprint = JSON.stringify([bookingId, items, note]);
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = { fingerprint, key: Crypto.randomUUID() };
    lock.current = true;
    setBusy(true);
    try {
      await api.request("kitchen/orders", {
        method: "POST",
        body: { bookingId, items, note },
        key: pending.current.key,
        authenticated: true,
      });
      pending.current = null;
      setCart({});
      setNote("");
      setMessage(
        "Order received. Food charges are separate from your room payment.",
      );
      await refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <View>
      <Text style={s.kicker}>ROOM SERVICE</Text>
      <Text style={s.title}>The WN kitchen</Text>
      <Text style={s.body}>Freshly prepared, delivered to your room.</Text>
      {!user ? (
        <Pressable style={s.button} onPress={onLogin}>
          <Text style={s.light}>Login to order</Text>
        </Pressable>
      ) : !bookingId ? (
        <Text style={s.notice}>
          Staff must check you in before ordering. Browse the menu while you
          wait.
        </Text>
      ) : (
        <Text style={s.notice}>
          Deliver to room {active.find((b) => b.id === bookingId)?.room_number}
        </Text>
      )}
      {active.length > 1 &&
        active.map((b) => (
          <Pressable key={b.id} onPress={() => setSelected(b.id)}>
            <Text style={s.body}>
              {b.id === bookingId ? "✓ " : ""}Room {b.room_number}
            </Text>
          </Pressable>
        ))}
      <Pressable
        style={s.button}
        disabled={busy}
        onPress={() => void refresh().catch((e) => setMessage(e.message))}
      >
        <Text style={s.light}>Refresh menu & stay</Text>
      </Pressable>
      {menu.map((d) => (
        <View style={s.card} key={d.id}>
          {d.photo_url && (
            <Image
              source={{ uri: photoAddress(d.photo_url) }}
              style={s.photo}
            />
          )}
          <Text style={s.heading}>{d.name}</Text>
          <Text style={s.body}>{d.description}</Text>
          <Text style={s.heading}>{money(d.price_minor, "MMK")}</Text>
          <View style={s.row}>
            <Pressable
              style={s.step}
              disabled={busy || !bookingId}
              onPress={() =>
                setCart({ ...cart, [d.id]: Math.max(0, (cart[d.id] || 0) - 1) })
              }
            >
              <Text>−</Text>
            </Pressable>
            <Text>{cart[d.id] || 0}</Text>
            <Pressable
              style={s.step}
              disabled={busy || !bookingId}
              onPress={() =>
                setCart({
                  ...cart,
                  [d.id]: Math.min(20, (cart[d.id] || 0) + 1),
                })
              }
            >
              <Text>+</Text>
            </Pressable>
          </View>
        </View>
      ))}
      {!menu.length && (
        <Text style={s.body}>The kitchen menu is being prepared.</Text>
      )}
      {bookingId && (
        <View style={s.card}>
          <Text style={s.body}>Allergies / notes</Text>
          <TextInput
            style={s.input}
            multiline
            maxLength={500}
            value={note}
            onChangeText={setNote}
            accessibilityLabel="Food order note"
          />
          <Text style={s.body}>
            Estimate{" "}
            {money(
              String(
                menu.reduce(
                  (t, d) => t + Number(d.price_minor) * (cart[d.id] || 0),
                  0,
                ),
              ),
              "MMK",
            )}
            . Current server prices apply.
          </Text>
          <Pressable
            style={s.button}
            disabled={busy}
            onPress={() => void order()}
          >
            <Text style={s.light}>
              {busy ? "Sending…" : "Place room-service order"}
            </Text>
          </Pressable>
        </View>
      )}
      <Text accessibilityLiveRegion="polite" style={s.notice}>
        {message}
      </Text>
      {orders.map((o) => (
        <View style={s.card} key={o.id}>
          <Text style={s.heading}>
            {o.status} · Room {o.room_number}
          </Text>
          {o.items?.map((i: any) => (
            <Text style={s.body} key={i.dish_id}>
              {i.quantity} × {i.dish_name}
            </Text>
          ))}
          <Text style={s.heading}>{money(o.total_minor, "MMK")}</Text>
          <Text style={s.small}>{o.id}</Text>
        </View>
      ))}
    </View>
  );
}
const s = StyleSheet.create({
  kicker: { color: "#866b3f", letterSpacing: 3, fontSize: 12, marginTop: 12 },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#173c32",
    marginVertical: 12,
  },
  heading: {
    fontSize: 19,
    fontWeight: "600",
    color: "#173c32",
    marginVertical: 8,
  },
  body: { fontSize: 15, lineHeight: 23, color: "#405b4b", marginVertical: 8 },
  light: { color: "#fff", fontWeight: "600" },
  notice: { color: "#665939", lineHeight: 23, marginVertical: 14 },
  button: {
    backgroundColor: "#214f3e",
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    marginVertical: 12,
    elevation: 5,
  },
  card: {
    padding: 20,
    backgroundColor: "#fffdf7",
    borderRadius: 24,
    marginVertical: 14,
    elevation: 6,
    shadowColor: "#173c32",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 18,
  },
  photo: { height: 200, width: "100%", borderRadius: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 24, marginTop: 14 },
  step: { padding: 16, backgroundColor: "#e1eadd", borderRadius: 12 },
  input: {
    padding: 14,
    minHeight: 70,
    borderColor: "#cbd8ca",
    borderWidth: 1,
    borderRadius: 12,
  },
  small: { fontSize: 11, color: "#748174" },
});
