"use client";
import { useState } from "react";
import { api, auth } from "../../lib/firebase";
export default function Developer() {
  const [result, setResult] = useState<unknown>(null),
    [error, setError] = useState("");
  return (
    <>
      <header>
        <a className="brand" href="/admin">
          WH<span>SYSTEM STATUS</span>
        </a>
      </header>
      <main>
        <h1>Developer / system status</h1>
        <p>
          Owner access only. Sign in on the Admin page first. Credentials are
          never displayed here.
        </p>
        <button
          onClick={() =>
            void (async () => {
              try {
                setError("");
                await auth().authStateReady();
                setResult(await api("admin/system", {}, true));
              } catch (e) {
                setResult(null);
                setError((e as Error).message);
              }
            })()
          }
        >
          Check configuration
        </button>
        <p role="status">{error}</p>
        {result !== null && <pre>{JSON.stringify(result, null, 2)}</pre>}
      </main>
    </>
  );
}
