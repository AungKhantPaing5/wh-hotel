"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { api, auth } from "../../lib/admin-firebase";
type Booking = {
  id: string;
  status: string;
  check_in: string;
  check_out: string;
  firebase_uid: string;
  total_amount_minor: string;
  currency: string;
};
type RoomType = {
  id: number;
  name: string;
  description: string;
  max_guests: number;
  nightly_amount_minor: string;
  amenities: string[];
  photo_urls: string[];
};
type Physical = {
  id: number;
  number: string;
  active: boolean;
  room_type: string;
};
type Staff = {
  firebase_uid: string;
  email: string | null;
  permissions: string[];
};
type Payment = {
  id: string;
  booking_id: string;
  amount_minor: string;
  currency: string;
  provider: string;
  created_at: string;
};
const availablePermissions = [
  "bookings.read",
  "bookings.manage",
  "rooms.manage",
  "payments.read",
];
const localTest = process.env.NEXT_PUBLIC_LOCAL_TEST === "true";
function RoomEditor({
  room,
  busy,
  save,
  upload,
  create = false,
}: {
  room: RoomType;
  busy: boolean;
  save: (body: unknown) => void;
  upload: (file: File) => void;
  create?: boolean;
}) {
  const [name, setName] = useState(room.name),
    [description, setDescription] = useState(room.description);
  const [price, setPrice] = useState(room.nightly_amount_minor),
    [capacity, setCapacity] = useState(room.max_guests);
  const [amenities, setAmenities] = useState(room.amenities.join(", ")),
    [photos, setPhotos] = useState(room.photo_urls.join("\n"));
  const [roomNumbers, setRoomNumbers] = useState("");
  return (
    <form
      aria-label={create ? "Create room type" : `Edit ${room.name}`}
      className="booking editor"
      onSubmit={(e) => {
        e.preventDefault();
        save({
          name,
          ...(create
            ? {
                roomNumbers: roomNumbers
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
              }
            : {}),
          description,
          maxGuests: capacity,
          nightlyAmountMinor: price,
          amenities: amenities
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          photoUrls: photos
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
        });
      }}
    >
      <h3>{create ? "Create room type" : room.name}</h3>
      {create && (
        <label>
          Room numbers, comma separated
          <input
            aria-label="New room numbers"
            required
            placeholder="401, 402, 403"
            value={roomNumbers}
            onChange={(e) => setRoomNumbers(e.target.value)}
          />
        </label>
      )}
      <label>
        Name
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label>
        Price in minor units (85,000 MMK = 8500000)
        <input
          required
          inputMode="numeric"
          pattern="[0-9]+"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </label>
      <label>
        Max guests
        <select
          value={capacity}
          onChange={(e) => setCapacity(Number(e.target.value))}
        >
          {[1, 2, 3, 4].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </label>
      <label>
        Amenities, comma separated
        <input
          value={amenities}
          onChange={(e) => setAmenities(e.target.value)}
        />
      </label>
      {!create && (
        <>
          {" "}
          <label>
            Upload room photo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy || room.photo_urls.length >= 8}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) upload(file);
                event.target.value = "";
              }}
            />
          </label>
          <p>
            JPEG, PNG or WebP, up to 5 MiB and 20 megapixels. Maximum 8 photos.
            Upload saves immediately; save any other edits first.
          </p>
          <div className="row">
            {room.photo_urls.map((url) => (
              <div key={url}>
                <img
                  src={url}
                  alt={room.name}
                  style={{
                    width: 120,
                    height: 90,
                    objectFit: "cover",
                    borderRadius: 8,
                  }}
                />
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    const next = photos
                      .split("\n")
                      .filter((p) => p.trim() && p.trim() !== url);
                    setPhotos(next.join("\n"));
                  }}
                >
                  Remove from selection
                </button>
              </div>
            ))}
          </div>
          <details>
            <summary>Advanced: photo addresses / selected photos</summary>
            <textarea
              aria-label="Photo addresses"
              value={photos}
              onChange={(e) => setPhotos(e.target.value)}
            />
          </details>
        </>
      )}
      {create && (
        <p>
          Create the room type first, then upload photos using its editor below.
        </p>
      )}
      <p>
        Changes affect new bookings. Existing booking totals remain unchanged.
        Uploaded images are stored on this hotel server. Removing a photo from
        selection takes effect after Save room type.
      </p>
      <button disabled={busy}>
        {create ? "Create room type" : "Save room type"}
      </button>
    </form>
  );
}
export default function Admin() {
  const signedInHere = useRef(false);
  const [rows, setRows] = useState<Booking[]>([]),
    [types, setTypes] = useState<RoomType[]>([]),
    [rooms, setRooms] = useState<Physical[]>([]),
    [staff, setStaff] = useState<Staff[]>([]),
    [payments, setPayments] = useState<Payment[]>([]);
  const [profile, setProfile] = useState<{
    permissions: string[];
    isOwner: boolean;
  } | null>(null);
  const [message, setMessage] = useState(
      "Sign in with an authorized WN account.",
    ),
    [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const [staffEmail, setStaffEmail] = useState(""),
    [selectedPermissions, setSelectedPermissions] = useState<string[]>([
      "bookings.read",
      "payments.read",
    ]);
  const [tab, setTab] = useState("Bookings"),
    [calendarDate, setCalendarDate] = useState(""),
    [calendar, setCalendar] = useState<
      { date: string; rooms: { name: string; available_rooms: number }[] }[]
    >([]);
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await fn();
      setMessage("Updated.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function load() {
    if (!signedInHere.current)
      throw new Error("Enter your admin email and password first.");
    await auth().authStateReady();
    const p = await api("me", {}, true);
    if (
      !p.isOwner &&
      !availablePermissions.some((permission) =>
        p.permissions.includes(permission),
      )
    ) {
      signedInHere.current = false;
      setProfile(null);
      await signOut(auth());
      throw new Error("This account does not have administration access.");
    }
    setProfile(p);
    setRows(
      p.permissions.includes("bookings.read")
        ? await api("admin/bookings", {}, true)
        : [],
    );
    if (p.permissions.includes("rooms.manage")) {
      setTypes(await api("admin/room-types", {}, true));
      setRooms(await api("admin/rooms", {}, true));
    } else {
      setTypes([]);
      setRooms([]);
    }
    setPayments(
      p.permissions.includes("payments.read")
        ? await api("admin/payments", {}, true)
        : [],
    );
    setStaff(p.isOwner ? await api("admin/staff", {}, true) : []);
  }
  async function loadCalendar() {
    const start = Date.parse(`${calendarDate}T00:00:00Z`);
    if (!Number.isFinite(start)) throw new Error("Choose a starting date.");
    setCalendar(
      await Promise.all(
        Array.from({ length: 14 }, async (_, i) => {
          const date = new Date(start + i * 86400000)
              .toISOString()
              .slice(0, 10),
            out = new Date(start + (i + 1) * 86400000)
              .toISOString()
              .slice(0, 10);
          return {
            date,
            rooms: await api(`availability?checkIn=${date}&checkOut=${out}`),
          };
        }),
      ),
    );
  }
  return (
    <>
      <header>
        <a className="brand" href="/">
          WN<span>ADMIN</span>
        </a>
        <nav>
          <a href="/">Customer website</a>
          {profile?.isOwner && <Link href="/developer">System status</Link>}
        </nav>
      </header>
      <main>
        <h1>WN Hotel administration</h1>
        {localTest && (
          <div className="notice">
            LOCAL TEST ONLY · Fake accounts, simulated payment, no real SMS or
            money.
          </div>
        )}
        {!profile && (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                signedInHere.current = false;
                try {
                  await signInWithEmailAndPassword(
                    auth(),
                    email.trim(),
                    password,
                  );
                  signedInHere.current = true;
                  await load();
                } catch (error) {
                  signedInHere.current = false;
                  setProfile(null);
                  await signOut(auth());
                  throw error;
                } finally {
                  setPassword("");
                }
              });
            }}
          >
            <input
              aria-label="Admin email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Admin email"
              autoComplete="username"
            />
            <input
              aria-label="Admin password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Password"
              autoComplete="current-password"
            />
            <button disabled={busy}>Email sign in</button>
          </form>
        )}
        {profile && (
          <div className="row">
            <button disabled={busy} onClick={() => void run(load)}>
              Load / refresh dashboard
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  signedInHere.current = false;
                  await signOut(auth());
                  setProfile(null);
                  setRows([]);
                  setTypes([]);
                  setRooms([]);
                  setStaff([]);
                  setPayments([]);
                  setCalendar([]);
                })
              }
            >
              Sign out
            </button>
          </div>
        )}
        <p role="status">{message}</p>
        {profile && (
          <>
            <div className="row">
              {[
                "Bookings",
                ...(profile.permissions.includes("rooms.manage")
                  ? ["Rooms", "Calendar"]
                  : []),
                ...(profile.permissions.includes("payments.read")
                  ? ["Payments"]
                  : []),
                ...(profile.isOwner ? ["Staff"] : []),
              ].map((name) => (
                <button
                  className={tab === name ? "" : "secondary"}
                  key={name}
                  onClick={() => setTab(name)}
                >
                  {name}
                </button>
              ))}
            </div>
            {tab === "Bookings" && (
              <section>
                <h2>Booking requests</h2>
                <p>Latest 200 records. Status is refreshed from the server.</p>
                {rows.map((b) => (
                  <div className="booking" key={b.id}>
                    <strong>{b.status}</strong>
                    <p>{b.id}</p>
                    <p>
                      {b.check_in.slice(0, 10)} → {b.check_out.slice(0, 10)} ·{" "}
                      {(Number(b.total_amount_minor) / 100).toLocaleString()}{" "}
                      {b.currency}
                    </p>
                    <small>Guest UID: {b.firebase_uid}</small>
                    {b.status === "PENDING_APPROVAL" &&
                      profile.permissions.includes("bookings.manage") && (
                        <div className="row">
                          {["accept", "reject"].map((action) => (
                            <button
                              disabled={busy}
                              key={action}
                              onClick={() =>
                                void run(async () => {
                                  await api(
                                    `admin/bookings/${b.id}`,
                                    {
                                      method: "PATCH",
                                      body: JSON.stringify({ action }),
                                    },
                                    true,
                                  );
                                  await load();
                                })
                              }
                            >
                              {action}
                            </button>
                          ))}
                        </div>
                      )}
                  </div>
                ))}
              </section>
            )}
            {tab === "Rooms" &&
              profile.permissions.includes("rooms.manage") && (
                <section>
                  <h2>Room types and rates</h2>
                  <details>
                    <summary>Create a new room type</summary>
                    <RoomEditor
                      create
                      key={types.length}
                      room={{
                        id: 0,
                        name: "",
                        description: "",
                        max_guests: 2,
                        nightly_amount_minor: "0",
                        amenities: [],
                        photo_urls: [],
                      }}
                      busy={busy}
                      upload={() => {}}
                      save={(body) =>
                        void run(async () => {
                          await api(
                            "admin/room-types",
                            { method: "POST", body: JSON.stringify(body) },
                            true,
                          );
                          await load();
                          setMessage(
                            "Room type and room inventory created. You can now upload photos below.",
                          );
                        })
                      }
                    />
                  </details>
                  <div className="grid">
                    {types.map((room) => (
                      <RoomEditor
                        key={JSON.stringify(room)}
                        room={room}
                        busy={busy}
                        upload={(file) =>
                          void run(async () => {
                            if (
                              ![
                                "image/jpeg",
                                "image/png",
                                "image/webp",
                              ].includes(file.type) ||
                              file.size > 5 * 1024 * 1024
                            )
                              throw new Error(
                                "Choose a JPEG, PNG or WebP image up to 5 MiB.",
                              );
                            const data = await new Promise<string>(
                              (resolve, reject) => {
                                const reader = new FileReader();
                                reader.onerror = () =>
                                  reject(new Error("Cannot read this photo."));
                                reader.onload = () =>
                                  resolve(
                                    String(reader.result).split(",")[1] || "",
                                  );
                                reader.readAsDataURL(file);
                              },
                            );
                            await api(
                              `admin/room-types/${room.id}/photos`,
                              {
                                method: "POST",
                                body: JSON.stringify({ data }),
                              },
                              true,
                            );
                            await load();
                          })
                        }
                        save={(body) =>
                          void run(async () => {
                            await api(
                              `admin/room-types/${room.id}`,
                              { method: "PATCH", body: JSON.stringify(body) },
                              true,
                            );
                            await load();
                          })
                        }
                      />
                    ))}
                  </div>
                  <h2>Physical room inventory</h2>
                  <p>
                    Offline rooms cannot receive new requests. Existing
                    reservations remain valid.
                  </p>
                  {rooms.map((room) => (
                    <div className="booking row" key={room.id}>
                      <strong>
                        {room.number} · {room.room_type} ·{" "}
                        {room.active ? "Available for sale" : "Offline"}
                      </strong>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await api(
                              `admin/rooms/${room.id}`,
                              {
                                method: "PATCH",
                                body: JSON.stringify({ active: !room.active }),
                              },
                              true,
                            );
                            await load();
                          })
                        }
                      >
                        {room.active ? "Take offline" : "Make available"}
                      </button>
                    </div>
                  ))}
                </section>
              )}
            {tab === "Calendar" &&
              profile.permissions.includes("rooms.manage") && (
                <section>
                  <h2>14-day availability calendar</h2>
                  <div className="row">
                    <input
                      aria-label="Calendar start"
                      type="date"
                      value={calendarDate}
                      onChange={(e) => setCalendarDate(e.target.value)}
                    />
                    <button
                      disabled={busy}
                      onClick={() => void run(loadCalendar)}
                    >
                      Load calendar
                    </button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Available rooms by category</th>
                        </tr>
                      </thead>
                      <tbody>
                        {calendar.map((day) => (
                          <tr key={day.date}>
                            <td>{day.date}</td>
                            <td>
                              {day.rooms
                                .map((r) => `${r.name}: ${r.available_rooms}`)
                                .join(" · ")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            {tab === "Payments" &&
              profile.permissions.includes("payments.read") && (
                <section>
                  <h2>Payment transactions</h2>
                  <p>
                    Only local-test simulated transactions are implemented. Live
                    gateways are disabled.
                  </p>
                  {payments.map((p) => (
                    <div key={p.id} className="booking">
                      <strong>
                        {p.provider} ·{" "}
                        {(Number(p.amount_minor) / 100).toLocaleString()}{" "}
                        {p.currency}
                      </strong>
                      <p>Booking: {p.booking_id}</p>
                      <small>{new Date(p.created_at).toLocaleString()}</small>
                    </div>
                  ))}
                </section>
              )}
            {tab === "Staff" && profile.isOwner && (
              <section>
                <h2>Staff permissions</h2>
                <p>
                  Enter the email of an existing account. The staff member must
                  sign up first. Revoking permissions removes admin access, not
                  the customer account.
                </p>
                <form
                  className="editor booking"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await api(
                        "admin/staff",
                        {
                          method: "POST",
                          body: JSON.stringify({
                            email: staffEmail,
                            permissions: selectedPermissions,
                          }),
                        },
                        true,
                      );
                      await load();
                    });
                  }}
                >
                  <input
                    aria-label="Staff email"
                    type="email"
                    required
                    value={staffEmail}
                    onChange={(e) => setStaffEmail(e.target.value)}
                    placeholder={
                      localTest ? "staff@wh.test" : "staff@example.com"
                    }
                  />
                  {availablePermissions.map((p) => (
                    <label key={p}>
                      <input
                        type="checkbox"
                        checked={selectedPermissions.includes(p)}
                        onChange={(e) =>
                          setSelectedPermissions(
                            e.target.checked
                              ? [...selectedPermissions, p]
                              : selectedPermissions.filter((v) => v !== p),
                          )
                        }
                      />
                      {p}
                    </label>
                  ))}
                  <button disabled={busy}>Save permissions</button>
                </form>
                {staff.map((member) => (
                  <div className="booking" key={member.firebase_uid}>
                    <strong>
                      {member.email || "Account email unavailable"}
                    </strong>
                    <p>{member.permissions.join(", ") || "No permissions"}</p>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await api(
                            `admin/staff/${encodeURIComponent(member.firebase_uid)}`,
                            { method: "DELETE" },
                            true,
                          );
                          await load();
                        })
                      }
                    >
                      Revoke access
                    </button>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}
