import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import { configurePrivateTest, runtime } from "./src/runtime";
export default function Bootstrap() {
  const [ready, setReady] = useState(false), [opened, setOpened] = useState(false);
  const [api, setApi] = useState(runtime.apiUrl || "http://192.168.1.50:3001/api");
  const [authUrl, setAuthUrl] = useState(runtime.testAuthUrl || "http://192.168.1.50:9099");
  const [error, setError] = useState("");
  const configuredLive = process.env.EXPO_PUBLIC_AUTH_ENABLED === "true";
  useEffect(() => { void (async () => {
    try {
      const raw = await SecureStore.getItemAsync("wn.test.server");
      if (raw) { const saved=JSON.parse(raw); setApi(saved.api); setAuthUrl(saved.auth); }
    } catch { setError("Saved server settings are unreadable. Enter them again."); }
    setReady(true);
  })(); }, []);
  if (!ready) return <SafeAreaProvider><SafeAreaView style={s.screen}><ActivityIndicator /></SafeAreaView></SafeAreaProvider>;
  if (opened || configuredLive) { const HotelApp = require("./App").default; return <HotelApp />; }
  async function connect() {
    try {
      configurePrivateTest(api, authUrl);
      const response = await fetch(runtime.apiUrl + "/health/live");
      const data = await response.json();
      if (!response.ok || !["WN","WH"].includes(data.hotel)) throw new Error("This address is not a WN hotel API.");
      await SecureStore.setItemAsync("wn.test.server", JSON.stringify({api:runtime.apiUrl,auth:runtime.testAuthUrl}));
      setOpened(true);
    } catch(e) { setError(e instanceof Error ? e.message : "Cannot connect. Check the SSH tunnel and Wi-Fi."); }
  }
  return <SafeAreaProvider><SafeAreaView style={s.screen}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <Text style={s.brand}>WN HOTEL</Text><Text style={s.title}>Test your stay</Text>
    <Text style={s.text}>Connect this phone to your private test server. The website, Admin and App will use the same bookings and uploaded photos.</Text>
    <Text style={s.label}>Hotel API URL</Text><TextInput accessibilityLabel="Hotel API URL" style={s.input} autoCapitalize="none" autoCorrect={false} value={api} onChangeText={setApi} />
    <Text style={s.label}>Test authentication URL</Text><TextInput accessibilityLabel="Test authentication URL" style={s.input} autoCapitalize="none" autoCorrect={false} value={authUrl} onChangeText={setAuthUrl} />
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <Pressable accessibilityRole="button" style={s.button} onPress={()=>void connect()}><Text style={s.buttonText}>Connect private test server</Text></Pressable>
    <Pressable accessibilityRole="button" style={s.secondary} onPress={()=>{runtime.localTest=false;runtime.apiUrl=process.env.EXPO_PUBLIC_API_URL||"";setOpened(true);}}><Text style={s.text}>Open room preview</Text></Pressable>
    <Text style={s.text}>Vultr testing: keep the Windows SSH tunnel open. Phone and PC must be on the same private Wi-Fi. Use the PC IPv4 address above, not the Vultr public IP.</Text>
    <Text style={s.text}>Customer: guest@wh.test · Password: WhTestOnly2026!\nNo real SMS or money. Close the app completely and reopen it to change servers.</Text>
  </ScrollView></SafeAreaView></SafeAreaProvider>;
}
const s=StyleSheet.create({
 screen:{flex:1,backgroundColor:"#f5f4ef"},content:{padding:24,gap:16,maxWidth:640,width:"100%",alignSelf:"center"},
 brand:{fontSize:34,fontWeight:"800",color:"#174b3f"},title:{fontSize:25,fontWeight:"700",color:"#174b3f"},
 text:{fontSize:14,lineHeight:23,color:"#435747"},label:{fontSize:13,fontWeight:"700",color:"#174b3f"},
 input:{padding:14,borderWidth:1,borderColor:"#bfcbbf",borderRadius:10,backgroundColor:"#fff",fontSize:14},
 button:{padding:16,borderRadius:10,backgroundColor:"#174b3f",alignItems:"center"},buttonText:{color:"#fff",fontWeight:"700"},
 secondary:{padding:14,alignItems:"center",backgroundColor:"#e5eee2",borderRadius:10},error:{color:"#a13021",lineHeight:22}
});
