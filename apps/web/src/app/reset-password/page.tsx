"use client";
import { useEffect, useState } from "react";
export default function Reset() {
  const [token, setToken] = useState(""),
    [password, setPassword] = useState(""),
    [repeat, setRepeat] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setToken(
      new URLSearchParams(window.location.hash.slice(1)).get("token") || "",
    );
    history.replaceState(null, "", window.location.pathname);
  }, []);
  return (
    <main className="reset-page">
      <meta name="referrer" content="no-referrer" />
      <a className="brand" href="/">
        WN HOTEL
      </a>
      <h1>Password recovery</h1>
      <form
        className="booking"
        onSubmit={async (e) => {
          e.preventDefault();
          if (password !== repeat) {
            setMessage("Passwords do not match.");
            return;
          }
          setBusy(true);
          try {
            const r = await fetch("/api/auth/reset", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-WN-Request": "1",
              },
              body: JSON.stringify({ token, password }),
            });
            const d = await r.json();
            if (!r.ok) throw Error(d.message);
            setMessage(d.message);
            setPassword("");
            setRepeat("");
            setToken("");
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Recovery code
          <input
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label>
          New password
          <input
            type="password"
            required
            minLength={6}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <label>
          Repeat password
          <input
            type="password"
            required
            minLength={6}
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
        </label>
        <button disabled={busy}>Reset password</button>
        <p role="status">{message}</p>
        <a href="/">Return to login</a>
      </form>
    </main>
  );
}
