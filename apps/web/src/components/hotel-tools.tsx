"use client";
import { useEffect, useRef, useState } from "react";
type Api = (
  path: string,
  init?: RequestInit,
  authenticated?: boolean,
) => Promise<any>;
const money = (p: string) => `${(Number(p) / 100).toLocaleString()} MMK`;
async function write(api: Api, path: string, body: any, method = "POST") {
  return api(path, { method, body: JSON.stringify(body) }, true);
}
export function ChangePassword({
  api,
  after,
  required,
}: {
  api: Api;
  after: () => Promise<void>;
  required: boolean;
}) {
  const [old, setOld] = useState(""),
    [password, setPassword] = useState(""),
    [repeat, setRepeat] = useState(""),
    [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <details className="booking" open={required || undefined}>
      <summary>
        {required
          ? "Change your temporary password to continue"
          : "Change password"}
      </summary>
      <form
        className="editor"
        onSubmit={async (e) => {
          e.preventDefault();
          if (password !== repeat) {
            setMsg("Passwords do not match.");
            return;
          }
          setBusy(true);
          try {
            await write(api, "auth/password", {
              currentPassword: old,
              password,
            });
            setOld("");
            setPassword("");
            setRepeat("");
            await after();
            setMsg("Password changed. Sign in again.");
          } catch (e) {
            setMsg((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Current password
          <input
            required
            type="password"
            value={old}
            onChange={(e) => setOld(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        <label>
          New password
          <input
            required
            minLength={12}
            maxLength={128}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <label>
          Repeat new password
          <input
            required
            type="password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
        </label>
        <button disabled={busy}>Change password</button>
        <p role="status">{msg}</p>
      </form>
    </details>
  );
}
export function AccountsPanel({ api }: { api: Api }) {
  const [rows, setRows] = useState<any[]>([]),
    [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setRows(await api("admin/accounts", {}, true));
  }
  useEffect(() => {
    void load().catch((e) => setMsg(e.message));
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>, uid?: string) {
    e.preventDefault();
    const form = e.currentTarget,
      fd = new FormData(form);
    setBusy(true);
    try {
      const b: any = { email: fd.get("email") };
      if (fd.get("password")) b.password = fd.get("password");
      if (uid) b.disabled = fd.get("disabled") === "on";
      await write(
        api,
        uid ? `admin/accounts/${uid}` : "admin/accounts",
        b,
        uid ? "PATCH" : "POST",
      );
      form.reset();
      await load();
      setMsg(
        "Account saved. Any changed credentials revoke existing sessions.",
      );
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2>Customer & staff accounts</h2>
      <p>
        Create accounts here, then assign staff permissions in Staff. Passwords
        stay hidden. New admin-set passwords require a change on next login.
      </p>
      <p role="status">{msg}</p>
      <form className="booking editor" onSubmit={(e) => void submit(e)}>
        <h3>Create account</h3>
        <label>
          Email
          <input name="email" type="email" required />
        </label>
        <label>
          Temporary password
          <input
            name="password"
            type="password"
            minLength={12}
            maxLength={128}
            required
            autoComplete="new-password"
          />
        </label>
        <button disabled={busy}>Create account</button>
      </form>
      <div className="grid">
        {rows
          .filter((a) => !a.is_owner)
          .map((a) => (
            <form
              key={a.uid + ":" + a.email + ":" + a.disabled}
              className="booking editor"
              onSubmit={(e) => void submit(e, a.uid)}
            >
              <h3>{a.email}</h3>
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  defaultValue={a.email}
                  required
                />
              </label>
              <label>
                Set new temporary password
                <input
                  name="password"
                  type="password"
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  placeholder="Leave blank to keep password"
                />
              </label>
              <label className="row">
                <input
                  type="checkbox"
                  name="disabled"
                  defaultChecked={a.disabled}
                />
                Disable account
              </label>
              <button disabled={busy}>Save account</button>
            </form>
          ))}
      </div>
    </section>
  );
}
type Dish = {
  id: number;
  name: string;
  description: string;
  photo_url: string | null;
  price_minor: string | null;
  active: boolean;
};
function DishEditor({
  dish,
  isOwner,
  save,
  busy,
  upload,
}: {
  dish?: Dish;
  isOwner: boolean;
  save: (b: any) => Promise<void>;
  busy: boolean;
  upload: (file: File) => Promise<string>;
}) {
  const [photo, setPhoto] = useState(dish?.photo_url || ""),
    [msg, setMsg] = useState("");
  return (
    <form
      className="booking editor"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        void save({
          name: fd.get("name"),
          description: fd.get("description"),
          active: fd.get("active") === "on",
          photoUrl: photo,
          ...(isOwner ? { priceMinor: fd.get("price") } : {}),
        });
      }}
    >
      <h3>{dish?.name || "New dish"}</h3>
      {photo && <img className="dish-photo" src={photo} alt="Dish preview" />}
      <label>
        Name
        <input name="name" required maxLength={120} defaultValue={dish?.name} />
      </label>
      <label>
        Description / allergens
        <textarea
          name="description"
          maxLength={2000}
          defaultValue={dish?.description}
        />
      </label>
      <label>
        Dish photo
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f)
              void upload(f)
                .then(setPhoto)
                .catch((e) => setMsg(e.message));
          }}
        />
      </label>
      {isOwner ? (
        <label>
          Price in minor units (5,000 MMK = 500000)
          <input
            name="price"
            required
            pattern="[0-9]+"
            defaultValue={dish?.price_minor || "0"}
            inputMode="numeric"
          />
        </label>
      ) : (
        <p>
          Price:{" "}
          {dish?.price_minor === null || !dish
            ? "Awaiting admin pricing"
            : money(dish.price_minor)}
          . Only admin can edit.
        </p>
      )}
      <label className="row">
        <input
          type="checkbox"
          name="active"
          defaultChecked={dish?.active ?? true}
        />
        Available
      </label>
      <button disabled={busy}>{dish ? "Save dish" : "Create dish"}</button>
      <p role="status">{msg}</p>
    </form>
  );
}
export function KitchenAdmin({ api, isOwner }: { api: Api; isOwner: boolean }) {
  const [dishes, setDishes] = useState<Dish[]>([]),
    [orders, setOrders] = useState<any[]>([]),
    [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const [d, o] = await Promise.all([
      api("admin/kitchen/dishes", {}, true),
      api("admin/kitchen/orders", {}, true),
    ]);
    setDishes(d);
    setOrders(o);
  }
  useEffect(() => {
    void load().catch((e) => setMsg(e.message));
    const timer = setInterval(() => void load().catch(() => {}), 10000);
    return () => clearInterval(timer);
  }, []);
  async function run(fn: () => Promise<any>) {
    setBusy(true);
    try {
      await fn();
      await load();
      setMsg("Kitchen updated.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    if (file.size > 5 * 1024 * 1024)
      throw Error("Maximum photo size is 5 MiB.");
    const data = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onerror = reject;
      r.onload = () => resolve(String(r.result).split(",")[1]);
      r.readAsDataURL(file);
    });
    return (await write(api, "admin/kitchen/photos", { data })).url;
  }
  const next: Record<string, string> = {
    PLACED: "PREPARING",
    PREPARING: "READY",
    READY: "DELIVERED",
  };
  return (
    <section>
      <h2>Kitchen</h2>
      <p>
        {isOwner
          ? "Manage dishes, rates and room-service orders."
          : "Manage dishes and orders. Admin sets all prices."}
      </p>
      <p role="status">{msg}</p>
      <h3>Room-service orders</h3>
      <button
        className="secondary"
        onClick={() => void run(load)}
        disabled={busy}
      >
        Refresh kitchen
      </button>
      <div className="grid">
        {orders.map((o) => (
          <article className="booking" key={o.id}>
            <span className="status-chip">{o.status}</span>
            <h3>Room {o.room_number}</h3>
            <p>{o.email}</p>
            {o.items?.map((i: any) => (
              <p key={i.dish_id}>
                {i.quantity} × {i.dish_name}
              </p>
            ))}
            <strong>{money(o.total_minor)}</strong>
            <p>{o.note}</p>
            {next[o.status] && (
              <div className="row">
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      write(
                        api,
                        `admin/kitchen/orders/${o.id}`,
                        { status: next[o.status] },
                        "PATCH",
                      ),
                    )
                  }
                >
                  {next[o.status]}
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      write(
                        api,
                        `admin/kitchen/orders/${o.id}`,
                        { status: "CANCELLED" },
                        "PATCH",
                      ),
                    )
                  }
                >
                  Cancel order
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      <h3>Menu management</h3>
      <div className="grid">
        <DishEditor
          isOwner={isOwner}
          save={(b) => run(() => write(api, "admin/kitchen/dishes", b))}
          busy={busy}
          upload={upload}
        />
        {dishes.map((d) => (
          <DishEditor
            key={JSON.stringify(d)}
            dish={d}
            isOwner={isOwner}
            save={(b) =>
              run(() => write(api, `admin/kitchen/dishes/${d.id}`, b, "PATCH"))
            }
            busy={busy}
            upload={upload}
          />
        ))}
      </div>
    </section>
  );
}
export function GuestKitchen({ api, bookings }: { api: Api; bookings: any[] }) {
  const [menu, setMenu] = useState<Dish[]>([]),
    [orders, setOrders] = useState<any[]>([]),
    [cart, setCart] = useState<Record<number, number>>({}),
    [note, setNote] = useState(""),
    [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false);
  const pending = useRef<{ fingerprint: string; key: string } | null>(null);
  const active = bookings.filter(
    (b) => b.status === "CONFIRMED" && b.checked_in_at && !b.checked_out_at,
  );
  const [selected, setSelected] = useState("");
  useEffect(() => {
    void Promise.all([api("kitchen/menu"), api("kitchen/orders", {}, true)])
      .then(([m, o]) => {
        setMenu(m);
        setOrders(o);
      })
      .catch((e) => setMsg(e.message));
  }, []);
  const bookingId = active.find((b) => b.id === selected)?.id || active[0]?.id;
  async function order() {
    const items = Object.entries(cart)
      .filter(([, q]) => q > 0)
      .map(([id, quantity]) => ({ dishId: Number(id), quantity }));
    if (!items.length) {
      setMsg("Choose a dish first.");
      return;
    }
    const fingerprint = JSON.stringify([bookingId, items, note]);
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = { fingerprint, key: crypto.randomUUID() };
    setBusy(true);
    try {
      const r = await api(
        "kitchen/orders",
        {
          method: "POST",
          headers: { "Idempotency-Key": pending.current.key },
          body: JSON.stringify({ bookingId, items, note }),
        },
        true,
      );
      setOrders(await api("kitchen/orders", {}, true));
      setCart({});
      setNote("");
      pending.current = null;
      setMsg(
        `Order received. Total ${money(r.total_minor)}. Food charges are separate from your room payment.`,
      );
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section id="guest-kitchen" className="guest-kitchen">
      <div className="section-heading">
        <div>
          <div className="eyebrow">ROOM SERVICE</div>
          <h2>Kitchen</h2>
        </div>
        <button
          className="secondary"
          disabled={busy}
          onClick={() =>
            void api("kitchen/orders", {}, true)
              .then(setOrders)
              .catch((e) => setMsg(e.message))
          }
        >
          Refresh orders
        </button>
      </div>
      {!active.length && (
        <p className="notice">
          Browse the menu now. Hotel staff must check you in before you can
          place an order.
        </p>
      )}
      {active.length > 1 && (
        <label>
          Deliver to
          <select
            value={bookingId}
            onChange={(e) => setSelected(e.target.value)}
          >
            {active.map((b) => (
              <option key={b.id} value={b.id}>
                Room {b.room_number}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="grid">
        {menu.map((d) => (
          <article className="booking dish-card" key={d.id}>
            {d.photo_url && (
              <img className="dish-photo" src={d.photo_url} alt={d.name} />
            )}
            <h3>{d.name}</h3>
            <p>{d.description}</p>
            <strong>{money(d.price_minor!)}</strong>
            <label>
              Quantity
              <input
                aria-label={`${d.name} quantity`}
                type="number"
                min={0}
                max={20}
                disabled={!bookingId || busy}
                value={cart[d.id] || 0}
                onChange={(e) =>
                  setCart({
                    ...cart,
                    [d.id]: Math.max(
                      0,
                      Math.min(20, Number(e.target.value) || 0),
                    ),
                  })
                }
              />
            </label>
          </article>
        ))}
      </div>
      {!menu.length && <p>The kitchen menu is being prepared.</p>}
      {bookingId && (
        <div className="booking editor">
          <label>
            Notes / allergies
            <textarea
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <p>
            Menu estimate:{" "}
            {money(
              menu
                .reduce(
                  (total, d) =>
                    total + Number(d.price_minor) * (cart[d.id] || 0),
                  0,
                )
                .toString(),
            )}
            . Server confirms current prices when ordering.
          </p>
          <button disabled={busy} onClick={() => void order()}>
            Place room-service order
          </button>
        </div>
      )}
      <p role="status">{msg}</p>
      {orders.map((o) => (
        <div className="booking" key={o.id}>
          <strong>
            {o.status} · Room {o.room_number} · {money(o.total_minor)}
          </strong>
          {o.items?.map((i: any) => (
            <p key={i.dish_id}>
              {i.quantity} × {i.dish_name}
            </p>
          ))}
          <small>Reference {o.id}</small>
        </div>
      ))}
    </section>
  );
}
