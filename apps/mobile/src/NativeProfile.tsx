import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  StyleSheet,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { WhApi } from "./api";
import { photoAddress } from "./runtime";
export function NativeProfile({
  api,
  onSaved,
}: {
  api: WhApi;
  onSaved: () => Promise<void>;
}) {
  const [profile, setProfile] = useState<any>(null),
    [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [address, setAddress] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  function apply(p: any) {
    setProfile(p);
    setName(p.fullName);
    setPhone(p.phone);
    setAddress(p.address);
  }
  useEffect(() => {
    void api
      .request("me/profile", { authenticated: true })
      .then(apply)
      .catch((e) => setMessage(e.message));
  }, []);
  async function photo() {
    setBusy(true);
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted)
        throw Error("Allow photo-library access to choose a profile picture.");
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset || !asset.base64 || asset.base64.length > 7000000)
        throw Error("Choose a photo up to 5 MiB.");
      setProfile(
        await api.request("me/profile/photo", {
          method: "POST",
          body: { data: asset.base64 },
          authenticated: true,
        }),
      );
      setMessage("Profile photo updated.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    try {
      apply(
        await api.request("me/profile", {
          method: "PATCH",
          body: { fullName: name, phone, address },
          authenticated: true,
        }),
      );
      await onSaved();
      setMessage("Profile updated.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!profile)
    return <Text style={s.message}>{message || "Loading your profile…"}</Text>;
  return (
    <View style={s.card}>
      <View style={s.banner}>
        <View style={s.avatar}>
          {profile.avatarUrl ? (
            <Image
              source={{ uri: photoAddress(profile.avatarUrl) }}
              style={s.photo}
            />
          ) : (
            <Text style={s.initials}>
              {(profile.fullName || profile.email).slice(0, 2).toUpperCase()}
            </Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.role}>
            {profile.isOwner
              ? "HOTEL ADMIN"
              : profile.permissions.length
                ? "STAFF MEMBER"
                : "WN GUEST"}
          </Text>
          <Text style={s.name}>{profile.fullName || "Your profile"}</Text>
          <Text style={s.email}>{profile.email}</Text>
        </View>
      </View>
      <Pressable
        style={s.photoButton}
        disabled={busy}
        onPress={() => void photo()}
      >
        <Text style={s.blue}>Change photo</Text>
      </Pressable>
      <Text style={s.section}>PERSONAL DETAILS</Text>
      <Text style={s.label}>Full name</Text>
      <TextInput
        accessibilityLabel="Profile full name"
        style={s.input}
        maxLength={100}
        value={name}
        onChangeText={setName}
        placeholder="Your name"
      />
      <Text style={s.label}>Phone number</Text>
      <TextInput
        accessibilityLabel="Profile phone"
        style={s.input}
        maxLength={11}
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
        placeholder="09xxxxxxxxx"
      />
      <Text style={s.label}>Address</Text>
      <TextInput
        accessibilityLabel="Profile address"
        style={[s.input, { height: 90, textAlignVertical: "top" }]}
        multiline
        maxLength={500}
        value={address}
        onChangeText={setAddress}
        placeholder="Your contact address"
      />
      {Boolean(profile.permissions.length) && (
        <>
          <Text style={s.label}>Staff assignment</Text>
          <Text style={s.message}>
            {[profile.jobTitle, profile.department]
              .filter(Boolean)
              .join(" · ") || "Not assigned yet"}
          </Text>
        </>
      )}
      <Text style={s.message}>
        Hotel administration manages your account email and staff assignment.
      </Text>
      <Pressable style={s.save} disabled={busy} onPress={() => void save()}>
        <Text style={s.light}>{busy ? "Saving…" : "Save profile"}</Text>
      </Pressable>
      <Text accessibilityLiveRegion="polite" style={s.message}>
        {message}
      </Text>
    </View>
  );
}
const s = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 22,
    overflow: "hidden",
    padding: 22,
    borderWidth: 1,
    borderColor: "#e4e9f2",
    marginVertical: 18,
    elevation: 2,
  },
  banner: {
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
    marginBottom: 18,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: "#3659e3",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  photo: { width: 72, height: 72 },
  initials: { color: "#fff", fontSize: 25, fontWeight: "700" },
  role: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: "#8090ad",
  },
  name: {
    fontSize: 22,
    fontWeight: "700",
    color: "#18263e",
    marginVertical: 6,
  },
  email: { fontSize: 12, color: "#8996aa" },
  photoButton: {
    borderWidth: 1,
    borderColor: "#dce5f6",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  blue: { color: "#3659e3", fontWeight: "600" },
  section: {
    fontSize: 10,
    color: "#8b9bb6",
    letterSpacing: 1.5,
    marginTop: 30,
    marginBottom: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#61718d",
    marginTop: 14,
    marginBottom: 9,
  },
  input: {
    borderWidth: 1,
    borderColor: "#dfe5ef",
    borderRadius: 10,
    padding: 13,
    fontSize: 15,
    color: "#18263e",
  },
  message: { fontSize: 12, color: "#8796b0", lineHeight: 20, marginTop: 12 },
  save: {
    backgroundColor: "#3659e3",
    padding: 16,
    borderRadius: 11,
    alignItems: "center",
    marginTop: 20,
  },
  light: { color: "#fff", fontWeight: "700" },
});
