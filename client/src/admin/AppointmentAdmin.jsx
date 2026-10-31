import { useEffect, useState } from "react";
import BookingForm from "../booking/BookingForm";
import { bookingApi, formatTime, money } from "../booking/api";
const transitions = {
  Pending: ["Confirmed", "Cancelled"],
  Confirmed: ["Checked In", "Cancelled", "No-Show"],
  "Checked In": ["In Service", "Cancelled"],
  "In Service": ["Completed"],
  Completed: [],
  Cancelled: [],
  "No-Show": [],
};
const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
function BookingConfiguration({ session }) {
  const [data, setData] = useState(null),
    [selected, setSelected] = useState(""),
    [profile, setProfile] = useState({ services: [], breaks: [] }),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const canEdit = session.staff.role === "Admin";
  useEffect(() => {
    let active = true;
    Promise.all(
      ["/booking-policy", "/artist-profiles", "/staff", "/services"].map(
        (path) => bookingApi("/api/admin" + path),
      ),
    )
      .then(([policy, profiles, staff, services]) => {
        if (active) setData({ policy, profiles, staff, services });
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function save(path, body) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const saved = await bookingApi("/api/admin" + path, {
        method: "PUT",
        session,
        body,
      });
      if (path === "/booking-policy") setData({ ...data, policy: saved });
      else
        setData({
          ...data,
          profiles: [
            ...data.profiles.filter((p) => p.staff !== selected),
            saved,
          ],
        });
      setMessage("Booking configuration saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="booking-admin-config">
      <h2>Booking rules & artist qualifications</h2>
      {error && (
        <div role="alert" className="booking-error">
          {error}
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {!data ? (
        <p>Loading booking configuration…</p>
      ) : (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const {
                _id: _id,
                createdAt: _createdAt,
                updatedAt: _updatedAt,
                __v: _v,
                ...policy
              } = data.policy;
              save("/booking-policy", policy);
            }}
          >
            <fieldset disabled={!canEdit || busy}>
              <legend>Customer booking rules</legend>
              {[
                [
                  "approvalRequired",
                  "Require approval (new reservations are Pending)",
                ],
                ["cancellationEnabled", "Allow customer cancellation"],
                ["reschedulingEnabled", "Allow customer rescheduling"],
              ].map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={data.policy[key]}
                    onChange={(e) =>
                      setData({
                        ...data,
                        policy: { ...data.policy, [key]: e.target.checked },
                      })
                    }
                  />
                  {label}
                </label>
              ))}
              {[
                [
                  "cancellationNoticeHours",
                  "Cancellation notice (hours)",
                  0,
                  720,
                ],
                [
                  "reschedulingNoticeHours",
                  "Rescheduling notice (hours)",
                  0,
                  720,
                ],
                [
                  "minimumNoticeMinutes",
                  "Minimum booking notice (minutes)",
                  0,
                  10080,
                ],
                ["advanceDays", "Book up to this many days ahead", 1, 365],
                ["slotIntervalMinutes", "Time-slot spacing (minutes)", 5, 60],
              ].map(([key, label, min, max]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    required
                    min={min}
                    max={max}
                    value={data.policy[key]}
                    onChange={(e) =>
                      setData({
                        ...data,
                        policy: {
                          ...data.policy,
                          [key]: Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
              ))}
              {canEdit && (
                <button className="button" disabled={busy}>
                  Save booking rules
                </button>
              )}
            </fieldset>
          </form>
          <p>
            Artists need both a saved weekly shift and a service qualification
            before they appear as available. Breaks use the salon timezone and
            repeat weekly.
          </p>
          <label>
            Artist
            <select
              value={selected}
              onChange={(e) => {
                const value = e.target.value;
                setSelected(value);
                const existing = data.profiles.find((p) => p.staff === value);
                setProfile(
                  existing
                    ? {
                        services: [...existing.services],
                        breaks: existing.breaks.map((b) => ({ ...b })),
                      }
                    : { services: [], breaks: [] },
                );
                setError("");
                setMessage("");
              }}
            >
              <option value="">Choose artist</option>
              {data.staff
                .filter((s) => s.role === "Artist" && s.active)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
          {selected && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save("/artist-profiles/" + selected, profile);
              }}
            >
              <fieldset disabled={!canEdit || busy}>
                <legend>Qualified services</legend>
                {data.services.map((service) => (
                  <label key={service._id}>
                    <input
                      type="checkbox"
                      checked={profile.services.includes(service._id)}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          services: e.target.checked
                            ? [...profile.services, service._id]
                            : profile.services.filter(
                                (id) => id !== service._id,
                              ),
                        })
                      }
                    />
                    {service.name}
                    {!service.active ? " (inactive)" : ""}
                  </label>
                ))}
                {!data.services.length && <p>Create salon services first.</p>}
                <h3>Recurring breaks</h3>
                {profile.breaks.map((pause, index) => (
                  <div className="booking-admin-break" key={index}>
                    <label>
                      Day
                      <select
                        value={pause.day}
                        onChange={(e) =>
                          setProfile({
                            ...profile,
                            breaks: profile.breaks.map((p, i) =>
                              i === index
                                ? { ...p, day: Number(e.target.value) }
                                : p,
                            ),
                          })
                        }
                      >
                        {days.map((day, i) => (
                          <option key={day} value={i}>
                            {day}
                          </option>
                        ))}
                      </select>
                    </label>
                    {["start", "end"].map((key) => (
                      <label key={key}>
                        {key}
                        <input
                          type="time"
                          required
                          value={pause[key]}
                          onChange={(e) =>
                            setProfile({
                              ...profile,
                              breaks: profile.breaks.map((p, i) =>
                                i === index
                                  ? { ...p, [key]: e.target.value }
                                  : p,
                              ),
                            })
                          }
                        />
                      </label>
                    ))}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() =>
                          setProfile({
                            ...profile,
                            breaks: profile.breaks.filter(
                              (_, i) => i !== index,
                            ),
                          })
                        }
                      >
                        Remove break
                      </button>
                    )}
                  </div>
                ))}
                {canEdit && (
                  <div className="booking-actions">
                    <button
                      type="button"
                      disabled={profile.breaks.length >= 50}
                      onClick={() =>
                        setProfile({
                          ...profile,
                          breaks: [
                            ...profile.breaks,
                            { day: 1, start: "12:00", end: "13:00" },
                          ],
                        })
                      }
                    >
                      Add break
                    </button>
                    <button className="button" disabled={busy}>
                      Save artist booking profile
                    </button>
                  </div>
                )}
              </fieldset>
            </form>
          )}
        </>
      )}
    </section>
  );
}
export default function AppointmentAdmin({ session }) {
  const [mode, setMode] = useState("list"),
    [data, setData] = useState(null),
    [q, setQ] = useState(""),
    [status, setStatus] = useState(""),
    [query, setQuery] = useState({ q: "", status: "", page: 1 }),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(null),
    [createdLink, setCreatedLink] = useState(""),
    [pendingUpdate, setPendingUpdate] = useState(null),
    [loading, setLoading] = useState(true);
  const desk = ["Admin", "Receptionist"].includes(session.staff.role);
  useEffect(() => {
    let active = true;
    bookingApi("/api/admin/appointments?" + new URLSearchParams(query))
      .then((result) => {
        if (active) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [query, revision]);
  function reload() {
    setLoading(true);
    setRevision((n) => n + 1);
  }
  async function update(reference, next) {
    setBusy(true);
    setError("");
    try {
      await bookingApi("/api/admin/appointments/" + reference, {
        method: "PATCH",
        session,
        body: { action: "status", status: next },
      });
      setMessage("Appointment updated.");
      setPendingUpdate(null);
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2>Appointments</h2>
      <div className="booking-actions">
        <button
          onClick={() => {
            setMode("list");
            setEditing(null);
            reload();
          }}
        >
          Reservations
        </button>
        {desk && (
          <button
            onClick={() => {
              setMode("create");
              setEditing(null);
              setMessage("");
            }}
          >
            Create manually
          </button>
        )}
        <button onClick={() => setMode("configuration")}>
          Booking configuration
        </button>
      </div>
      {error && (
        <div role="alert" className="booking-error">
          {error}
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {pendingUpdate && (
        <div role="alert" className="booking-error">
          <p>
            Set {pendingUpdate.reference} to {pendingUpdate.next}?
          </p>
          <div className="booking-actions">
            <button
              disabled={busy}
              onClick={() =>
                update(pendingUpdate.reference, pendingUpdate.next)
              }
            >
              Confirm status change
            </button>
            <button disabled={busy} onClick={() => setPendingUpdate(null)}>
              Keep current status
            </button>
          </div>
        </div>
      )}
      {createdLink && (
        <label className="booking-private">
          Private customer access link — share securely, then keep it private
          <input
            readOnly
            value={createdLink}
            onFocus={(e) => e.target.select()}
          />
        </label>
      )}
      {mode === "configuration" ? (
        <BookingConfiguration session={session} />
      ) : mode === "create" ? (
        <>
          <h3>New appointment</h3>
          <BookingForm
            session={session}
            onBooked={(result) => {
              setCreatedLink(
                window.location.origin +
                  "/appointments/manage#" +
                  new URLSearchParams({
                    reference: result.appointment.reference,
                    token: result.token,
                  }),
              );
              setMessage(
                "Created " +
                  result.appointment.reference +
                  " · " +
                  result.appointment.status,
              );
              setMode("list");
              reload();
            }}
          />
        </>
      ) : (
        <>
          <form
            className="booking-admin-search"
            onSubmit={(e) => {
              e.preventDefault();
              setLoading(true);
              setQuery({ q, status, page: 1 });
            }}
          >
            <input
              aria-label="Search appointments"
              placeholder="Reference, name, or phone"
              maxLength={120}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              aria-label="Appointment status filter"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All statuses</option>
              {Object.keys(transitions).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <button type="submit">Search</button>
          </form>
          {loading ? (
            <p role="status">Loading appointments…</p>
          ) : !data?.appointments.length ? (
            <p>No matching appointments.</p>
          ) : (
            <>
              <p>
                {data.total} appointment(s) · page {data.page}
              </p>
              {data.appointments.map((appointment) => (
                <article className="booking-admin-record" key={appointment._id}>
                  <p className="eyebrow">
                    {appointment.reference} · {appointment.status}
                  </p>
                  <h3>
                    {appointment.serviceName} · {appointment.artistName}
                  </h3>
                  <p>
                    {formatTime(appointment.start, appointment.timezone)} (
                    {appointment.timezone}) · {appointment.durationMinutes}{" "}
                    minutes ·{" "}
                    {money(appointment.priceMinor, appointment.currency)}
                  </p>
                  <p>
                    {appointment.customerName} · {appointment.phone}
                  </p>
                  {appointment.notes && <p>Notes: {appointment.notes}</p>}
                  <div className="booking-actions">
                    {transitions[appointment.status]
                      .filter(
                        (s) =>
                          desk ||
                          [
                            "Checked In",
                            "In Service",
                            "Completed",
                            "No-Show",
                          ].includes(s),
                      )
                      .map((next) => (
                        <button
                          key={next}
                          disabled={busy}
                          onClick={() =>
                            setPendingUpdate({
                              reference: appointment.reference,
                              next,
                            })
                          }
                        >
                          {next}
                        </button>
                      ))}
                    {desk &&
                      ["Pending", "Confirmed"].includes(appointment.status) && (
                        <button
                          onClick={() => {
                            setEditing(
                              editing === appointment.reference
                                ? null
                                : appointment.reference,
                            );
                            setError("");
                          }}
                        >
                          Reschedule / reassign
                        </button>
                      )}
                  </div>
                  {editing === appointment.reference && (
                    <BookingForm
                      reservation={appointment}
                      session={session}
                      onBooked={() => {
                        setEditing(null);
                        setMessage("Appointment rescheduled.");
                        reload();
                      }}
                    />
                  )}
                </article>
              ))}
              <div className="booking-actions">
                <button
                  disabled={data.page <= 1}
                  onClick={() => {
                    setLoading(true);
                    setQuery({ ...query, page: query.page - 1 });
                  }}
                >
                  Previous
                </button>
                <button
                  disabled={data.page * 30 >= data.total}
                  onClick={() => {
                    setLoading(true);
                    setQuery({ ...query, page: query.page + 1 });
                  }}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
