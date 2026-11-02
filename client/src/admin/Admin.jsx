import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./admin.css";
import AppointmentAdmin from "./AppointmentAdmin";
import QueueAdmin from "./QueueAdmin";
import OperationsDashboard from "./OperationsDashboard";
import BusinessReports from "./BusinessReports";
import NotificationSettings from "./NotificationSettings";
import { money, salonDefaults } from "../localization";
const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const defaults = {
  staff: { name: "", email: "", password: "", role: "Artist", active: true },
  services: {
    name: "",
    category: "General",
    description: "",
    imageUrl: "",
    priceMinor: 0,
    durationMinutes: 30,
    active: true,
  },
  schedules: {
    staff: "",
    day: 1,
    start: "09:00",
    end: "17:00",
    available: true,
  },
};
const definitions = {
  staff: [
    ["name", "Name", "text"],
    ["email", "Email", "email"],
    [
      "password",
      "Password (12–128 characters; leave blank to keep when editing)",
      "password",
    ],
    ["role", "Role", "role"],
    ["active", "Active", "checkbox"],
  ],
  services: [
    ["name", "Service name", "text"],
    ["category", "Category", "text"],
    ["description", "Description (optional)", "textarea"],
    ["imageUrl", "Image URL (optional; https://)", "url"],
    ["priceMinor", "Price in smallest currency units", "number"],
    ["durationMinutes", "Duration (minutes)", "number"],
    ["active", "Active", "checkbox"],
  ],
  schedules: [
    ["staff", "Staff member", "staff"],
    ["day", "Day", "day"],
    ["start", "Start", "time"],
    ["end", "End", "time"],
    ["available", "Available", "checkbox"],
  ],
};
export default function Admin() {
  const [session, setSession] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [pane, setPane] = useState("dashboard"),
    [rows, setRows] = useState([]),
    [staff, setStaff] = useState([]),
    [form, setForm] = useState(null),
    [editing, setEditing] = useState(null),
    [busy, setBusy] = useState(false),
    [settings, setSettings] = useState(null);
  async function request(path, method = "GET", body) {
    const response = await fetch("/api/admin" + path, {
      method,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(session ? { "X-CSRF-Token": session.csrf } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) setSession(null);
      throw new Error(data.error || "Request failed");
    }
    return data;
  }
  useEffect(() => {
    let active = true;
    fetch("/api/admin/auth/me")
      .then(async (res) => {
        const body = await res.json();
        if (!active) return;
        if (res.ok) setSession(body);
        else if (res.status !== 401) setError(body.error);
      })
      .catch(() => {
        if (active)
          setError(
            "Cannot reach staff administration. Start the API and database.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    let active = true;
    Promise.all(
      ["/staff", "/services", "/schedules", "/settings"].map((path) =>
        fetch("/api/admin" + path).then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          return data;
        }),
      ),
    )
      .then(([people, services, schedules, salon]) => {
        if (!active) return;
        setStaff(people);
        setRows(
          pane === "staff"
            ? people
            : pane === "services"
              ? services
              : schedules,
        );
        setSettings(
          salon || {
            name: "Henna & Beauty (placeholder)",
            ...salonDefaults,
            hours: days.map((_, day) => ({
              day,
              closed: day === 0,
              open: "09:00",
              close: "17:00",
            })),
          },
        );
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [session, pane]);
  async function perform(action) {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  function changePane(next) {
    setPane(next);
    setForm(null);
    setEditing(null);
    setError("");
    setMessage("");
    setRows([]);
  }
  async function refresh() {
    setRows(await request("/" + pane));
    if (pane === "staff") setStaff(await request("/staff"));
  }
  async function save(event) {
    event.preventDefault();
    await perform(async () => {
      const body = { ...form };
      if (pane === "staff" && editing && !body.password) delete body.password;
      if (pane === "schedules" && editing) {
        delete body.staff;
        delete body.day;
      }
      await request(
        "/" + pane + (editing ? "/" + editing : ""),
        editing ? "PATCH" : "POST",
        body,
      );
      setForm(null);
      setMessage("Saved successfully.");
      if (pane === "staff" && editing === session.staff.id) {
        setSession(null);
        return;
      }
      await refresh();
    });
  }
  const canEdit = session?.staff.role === "Admin";
  const formatMoney = (value) => {
    return money(value, settings?.currency || salonDefaults.currency);
  };
  return (
    <div className="admin-shell">
      <header className="admin-header">
        <Link to="/">✳ henna & beauty</Link>
        <span>Staff administration</span>
        {session && (
          <button
            disabled={busy}
            onClick={() =>
              perform(async () => {
                await request("/auth/logout", "POST", {});
                setSession(null);
                setForm(null);
              })
            }
          >
            Log out
          </button>
        )}
      </header>
      <main className="admin-main">
        <p className="eyebrow">SALON WORKSPACE</p>
        <h1>{session ? "Welcome, " + session.staff.name : "Staff login"}</h1>
        {error && (
          <div role="alert" className="admin-alert">
            {error}
          </div>
        )}
        {message && <p role="status">{message}</p>}
        {loading ? (
          <p>Checking your session…</p>
        ) : !session ? (
          <form
            className="admin-form login-form"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              perform(async () => {
                setSession(
                  await request("/auth/login", "POST", {
                    email: data.get("email"),
                    password: data.get("password"),
                  }),
                );
              });
            }}
          >
            <p>
              Use your salon staff account. Accounts are created by an
              administrator.
            </p>
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                maxLength={254}
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </label>
            <button className="button" disabled={busy}>
              {busy ? "Signing in…" : "Log in"}
            </button>
            <Link to="/">Return to public website</Link>
          </form>
        ) : (
          <>
            <p className="admin-role">
              {session.staff.role} ·{" "}
              {canEdit
                ? "Manage the salon."
                : session.staff.role === "Artist"
                  ? "View your schedule and assigned visits."
                  : "Manage appointments and the queue."}
            </p>
            <nav className="admin-tabs" aria-label="Administration">
              <span className="admin-tab-label">Today</span>
              {["dashboard", "appointments", "queue"].map((item) => (
                <button
                  key={item}
                  aria-current={pane === item ? "page" : undefined}
                  onClick={() => changePane(item)}
                >
                  {item === "dashboard" ? "Operations" : item}
                </button>
              ))}
              <span className="admin-tab-label">Manage salon</span>
              {canEdit && <button aria-current={pane === "reports" ? "page" : undefined} onClick={() => changePane("reports")}>Reports</button>}
              {["services", "staff", "schedules", "hours"].map((item) => (
                <button
                  key={item}
                  aria-current={pane === item ? "page" : undefined}
                  onClick={() => changePane(item)}
                >
                  {item === "staff" && session.staff.role === "Artist"
                    ? "My account"
                    : item === "hours"
                      ? "Settings & hours"
                      : item}
                </button>
              ))}
            </nav>
            {pane === "dashboard" ? (
              <OperationsDashboard session={session} onOpen={changePane} />
            ) : pane === "reports" && canEdit ? (
              <BusinessReports />
            ) : pane === "queue" ? (
              <QueueAdmin session={session} />
            ) : pane === "appointments" ? (
              <AppointmentAdmin session={session} />
            ) : pane === "hours" ? (
              settings && (
                <form
                  className="admin-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    perform(async () => {
                      const { name, currency, timezone, hours, phone = "", email = "", address = "" } = settings;
                      setSettings(
                        await request("/settings", "PUT", {
                          name,
                          currency,
                          timezone,
                          hours,
                          phone, email, address,
                        }),
                      );
                      setMessage("Business settings saved.");
                    });
                  }}
                >
                  <h2>Business hours & settings</h2>
                  {(settings.currency !== salonDefaults.currency || settings.timezone !== salonDefaults.timezone) && <p className="admin-alert" role="status">Minnesota target settings are USD and America/Chicago. Current saved settings are {settings.currency} and {settings.timezone}. Review existing prices and active visits before changing them; never relabel legacy prices or shift saved visits.</p>}
                  <p className="booking-note">Hours changes that conflict with future appointments are rejected. Timezone changes require reviewing future appointments and clearing active queue visits. Existing reservations retain their saved time, price, currency, and duration.</p>
                  {canEdit && <div className="admin-actions">
                    <button type="button" onClick={() => changePane("appointments")}>Appointment policies & qualifications</button>
                    <button type="button" onClick={() => changePane("queue")}>Queue rules & grace periods</button>
                  </div>}
                  {!settings._id && (
                    <p>
                      Suggested defaults — review and save to create salon
                      settings.
                    </p>
                  )}
                  <p>
                    Hours are local to the selected timezone. Closed days are
                    marked explicitly.
                  </p>
                  {[
                    ["name", "Salon name"],
                    ["currency", "Currency (USD for US dollars)"],
                    ["timezone", "Timezone (America/Chicago for Minnesota)"],
                  ].map(([key, label]) => (
                    <label key={key}>
                      {label}
                      <input
                        required
                        disabled={!canEdit}
                        value={settings[key]}
                        onChange={(e) =>
                          setSettings({ ...settings, [key]: e.target.value })
                        }
                      />
                    </label>
                  ))}
                  {[["phone", "Contact phone", "tel", 30], ["email", "Contact email", "email", 254], ["address", "Salon address", "text", 500]].map(([key, label, type, maxLength]) => <label key={key}>{label} (optional)<input type={type} maxLength={maxLength} disabled={!canEdit} value={settings[key] || ""} onChange={(event) => setSettings({ ...settings, [key]: event.target.value })} /></label>)}
                  {canEdit && <NotificationSettings />}
                  <div className="hours-grid">
                    {settings.hours.map((hour, index) => (
                      <fieldset key={hour.day}>
                        <legend>{days[hour.day]}</legend>
                        <label>
                          Closed
                          <input
                            type="checkbox"
                            disabled={!canEdit}
                            checked={hour.closed}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                hours: settings.hours.map((h, i) =>
                                  i === index
                                    ? { ...h, closed: e.target.checked }
                                    : h,
                                ),
                              })
                            }
                          />
                        </label>
                        {["open", "close"].map((key) => (
                          <label key={key}>
                            {key}
                            <input
                              type="time"
                              required
                              disabled={!canEdit || hour.closed}
                              value={hour[key]}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  hours: settings.hours.map((h, i) =>
                                    i === index
                                      ? { ...h, [key]: e.target.value }
                                      : h,
                                  ),
                                })
                              }
                            />
                          </label>
                        ))}
                      </fieldset>
                    ))}
                  </div>
                  {canEdit && (
                    <button className="button" disabled={busy}>
                      Save settings
                    </button>
                  )}
                </form>
              )
            ) : (
              <>
                <div className="admin-section-title">
                  <h2>
                    {pane === "schedules"
                      ? "Weekly availability"
                      : pane === "staff"
                        ? "Staff accounts"
                        : "Service catalogue"}
                  </h2>
                  {canEdit && (
                    <button
                      className="button"
                      onClick={() => {
                        setForm({ ...defaults[pane] });
                        setEditing(null);
                      }}
                    >
                      Add{" "}
                      {pane === "staff"
                        ? "staff"
                        : pane === "services"
                          ? "service"
                          : "schedule"}
                    </button>
                  )}
                </div>
                {pane === "services" && (
                  <p>
                    Active services appear on the public menu. To make a service
                    bookable, assign it to an active Artist in Booking
                    configuration and save that Artist’s recurring shift.
                    USD prices are stored in cents: 3000 means $30.00. Legacy currencies retain their original units. Confirm every price before changing business currency.
                  </p>
                )}
                {pane === "schedules" && (
                  <p>
                    One recurring shift per staff member per weekday.
                    Unavailable shifts remain visible. These records do not
                    calculate appointment slots.
                  </p>
                )}
                {form && (
                  <form className="admin-form editor-form" onSubmit={save}>
                    <h3>
                      {editing ? "Edit" : "Add"} {pane}
                    </h3>
                    {definitions[pane].map(([key, label, type]) => (
                      <label key={key}>
                        {label}
                        {["role", "staff", "day"].includes(type) ? (
                          <select
                            disabled={!!editing && pane === "schedules"}
                            required
                            value={form[key]}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                [key]:
                                  type === "day"
                                    ? Number(e.target.value)
                                    : e.target.value,
                              })
                            }
                          >
                            {type === "role" ? (
                              ["Admin", "Receptionist", "Artist"].map(
                                (role) => <option key={role}>{role}</option>,
                              )
                            ) : type === "day" ? (
                              days.map((day, i) => (
                                <option key={day} value={i}>
                                  {day}
                                </option>
                              ))
                            ) : (
                              <>
                                <option value="">Choose staff</option>
                                {staff
                                  .filter((s) => s.active)
                                  .map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.name}
                                    </option>
                                  ))}
                              </>
                            )}
                          </select>
                        ) : type === "textarea" ? (
                          <textarea
                            rows={3}
                            maxLength={1000}
                            value={form[key]}
                            onChange={(e) =>
                              setForm({ ...form, [key]: e.target.value })
                            }
                          />
                        ) : (
                          <input
                            type={type}
                            required={
                              type !== "checkbox" &&
                              !["password", "description", "imageUrl"].includes(key) &&
                              (key !== "password" || !editing)
                            }
                            min={key === "durationMinutes" ? 5 : 0}
                            max={
                              key === "durationMinutes"
                                ? 1440
                                : key === "priceMinor"
                                  ? 1000000000
                                  : undefined
                            }
                            minLength={key === "password" ? 12 : undefined}
                            maxLength={
                              type === "password"
                                ? 128
                                : key === "description"
                                  ? 1000
                                  : key === "imageUrl"
                                    ? 2048
                                    : key === "category"
                                      ? 80
                                  : 254
                            }
                            autoComplete={
                              key === "password" ? "new-password" : undefined
                            }
                            {...(type === "checkbox"
                              ? { checked: form[key] }
                              : { value: form[key] })}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                [key]:
                                  type === "checkbox"
                                    ? e.target.checked
                                    : type === "number"
                                      ? Number(e.target.value)
                                      : e.target.value,
                              })
                            }
                          />
                        )}
                      </label>
                    ))}
                    <div className="admin-actions">
                      <button className="button" disabled={busy}>
                        Save
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setForm(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
                <div className="admin-records">
                  {!rows.length && <p>No records yet.</p>}
                  {rows.map((row) => {
                    const key = row.id || row._id;
                    return (
                      <article key={key}>
                        <div>
                          <h3>
                            {pane === "schedules"
                              ? (staff.find((s) => s.id === row.staff)?.name ||
                                  "Staff") +
                                " · " +
                                days[row.day]
                              : row.name}
                          </h3>
                          <p>
                            {pane === "staff"
                              ? row.email +
                                " · " +
                                row.role +
                                " · " +
                                (row.active ? "Active" : "Inactive")
                              : pane === "services"
                                ? `${row.category || "General"} · ${formatMoney(row.priceMinor)} · ${row.durationMinutes} min · ${row.active ? "Active" : "Inactive"}${row.imageUrl ? " · Image linked" : ""}`
                                : `${row.start}–${row.end} · ${row.available ? "Available" : "Unavailable"}`}
                          </p>
                          {pane === "services" && row.description && (
                            <p>{row.description}</p>
                          )}
                          {row.bootstrap && (
                            <small>Protected initial administrator</small>
                          )}
                        </div>
                        {canEdit && (
                          <div className="admin-actions">
                            <button
                              onClick={() => {
                                const next = {};
                                for (const [field] of definitions[pane])
                                  next[field] =
                                    field === "password" ? "" : row[field];
                                setForm(next);
                                setEditing(key);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              disabled={
                                busy ||
                                row.bootstrap ||
                                key === session.staff.id
                              }
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "Delete this record? This cannot be undone.",
                                  )
                                )
                                  perform(async () => {
                                    await request(
                                      "/" + pane + "/" + key,
                                      "DELETE",
                                      {},
                                    );
                                    await refresh();
                                    setMessage("Record deleted.");
                                  });
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
