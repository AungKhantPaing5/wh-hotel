"use client";
import { useEffect, useState } from "react";
type Api = (
  path: string,
  init?: RequestInit,
  authenticated?: boolean,
) => Promise<any>;
export function ProfileEditor({
  api,
  targetUid,
  onSaved,
}: {
  api: Api;
  targetUid?: string;
  onSaved?: () => void;
}) {
  const [profile, setProfile] = useState<any>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const path = targetUid
    ? `admin/accounts/${encodeURIComponent(targetUid)}/profile`
    : "me/profile";
  useEffect(() => {
    setProfile(null);
    void api(path, {}, true)
      .then(setProfile)
      .catch((e) => setMessage(e.message));
  }, [path]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData(e.currentTarget),
        body = {
          fullName: fd.get("fullName"),
          address: fd.get("address"),
          phone: fd.get("phone"),
          ...(targetUid
            ? { jobTitle: fd.get("jobTitle"), department: fd.get("department") }
            : {}),
        };
      setProfile(
        await api(path, { method: "PATCH", body: JSON.stringify(body) }, true),
      );
      setMessage("Profile updated.");
      onSaved?.();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function photo(file: File) {
    setBusy(true);
    try {
      if (file.size > 5 * 1024 * 1024)
        throw Error("Choose a photo up to 5 MiB.");
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onerror = reject;
        r.onload = () => resolve(String(r.result).split(",")[1]);
        r.readAsDataURL(file);
      });
      setProfile(
        await api(
          "me/profile/photo",
          { method: "POST", body: JSON.stringify({ data }) },
          true,
        ),
      );
      setMessage("Profile photo updated.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!profile)
    return (
      <section className="profile-pane">
        <p role="status">{message || "Loading profile…"}</p>
      </section>
    );
  const role = profile.isOwner
    ? "Hotel administrator"
    : profile.permissions.length
      ? "Staff member"
      : "WN guest";
  return (
    <section className="profile-pane">
      <div className="profile-banner">
        <div className="profile-avatar">
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt="Profile photo" />
          ) : (
            (profile.fullName || profile.email).slice(0, 2).toUpperCase()
          )}
        </div>
        <div>
          <span className="profile-role">{role}</span>
          <h2>{profile.fullName || "Your profile"}</h2>
          <p>{profile.email}</p>
          {(profile.jobTitle || profile.department) && (
            <p>
              {[profile.jobTitle, profile.department]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
      </div>
      <div className="profile-form-body">
        <div className="section-heading">
          <div>
            <div className="eyebrow">PERSONAL DETAILS</div>
            <h3>Make yourself known</h3>
          </div>
          {!targetUid && (
            <label className="photo-upload-button">
              Change photo
              <input
                aria-label="Profile photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void photo(f);
                }}
              />
            </label>
          )}
        </div>
        <form
          className="profile-form"
          key={profile.uid}
          onSubmit={(e) => void save(e)}
        >
          <label>
            Full name
            <input
              name="fullName"
              aria-label="Profile full name"
              defaultValue={profile.fullName}
              maxLength={100}
              placeholder="Your name"
            />
          </label>
          <label>
            Email address
            <input value={profile.email} readOnly />
            <small>Hotel administration manages account email.</small>
          </label>
          <label>
            Phone number
            <input
              name="phone"
              aria-label="Profile phone"
              defaultValue={profile.phone}
              required
              pattern="09[0-9]{9}"
              minLength={11}
              maxLength={11}
              placeholder="09xxxxxxxxx"
            />
          </label>
          {targetUid ? (
            <>
              <label>
                Job title
                <input
                  name="jobTitle"
                  aria-label="Staff job title"
                  defaultValue={profile.jobTitle}
                  maxLength={100}
                  placeholder="e.g. Front desk officer"
                />
              </label>
              <label>
                Department
                <input
                  name="department"
                  aria-label="Staff department"
                  defaultValue={profile.department}
                  maxLength={100}
                  placeholder="e.g. Reception"
                />
              </label>
            </>
          ) : (
            profile.permissions.length > 0 && (
              <label>
                Staff assignment
                <input
                  value={
                    [profile.jobTitle, profile.department]
                      .filter(Boolean)
                      .join(" · ") || "Not assigned yet"
                  }
                  readOnly
                />
                <small>Administration manages staff assignments.</small>
              </label>
            )
          )}
          <label className="full-width">
            Address
            <textarea
              name="address"
              aria-label="Profile address"
              defaultValue={profile.address}
              maxLength={500}
              rows={3}
              placeholder="Your contact address"
            />
          </label>
          <div className="profile-save full-width">
            <p role="status">{message}</p>
            <button disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
          </div>
        </form>
      </div>
    </section>
  );
}
