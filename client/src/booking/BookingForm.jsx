import { useEffect, useState } from "react";
import { bookingApi, money, formatTime } from "./api";
import "./booking.css";
import { slotTime } from "../localization";
export default function BookingForm({
  onBooked,
  session,
  reservation,
  token,
  initialService = "",
}) {
  const [catalog, setCatalog] = useState(null),
    [service, setService] = useState(reservation?.service || initialService),
    [artist, setArtist] = useState(""),
    [date, setDate] = useState(""),
    [slots, setSlots] = useState([]),
    [start, setStart] = useState(""),
    [customer, setCustomer] = useState({
      customerName: "",
      phone: "+1 ",
      notes: "",
    }),
    [inAppUpdates, setInAppUpdates] = useState(true),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState(false),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    bookingApi("/api/booking/catalog", { signal: controller.signal })
      .then(setCatalog)
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!service || !date) return;
    const controller = new AbortController();
    bookingApi(
      "/api/booking/availability?" +
        new URLSearchParams({ service, date, ...(artist ? { artist } : {}) }),
      { signal: controller.signal },
    )
      .then((data) => {
        setSlots(data.slots);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [service, date, artist, refresh]);
  function reset() {
    setSlots([]);
    setStart("");
    setError("");
    setReview(false);
    if (service && date) setLoading(true);
  }
  function chooseDate(event) {
    reset();
    setDate(event.target.value);
    if (event.target.value && service) setLoading(true);
  }
  async function submit() {
    setBusy(true);
    setError("");
    try {
      let result;
      if (reservation)
        result = {
          appointment: await bookingApi(
            (session
              ? "/api/admin/appointments/"
              : "/api/booking/reservations/") + reservation.reference,
            {
              method: "PATCH",
              session,
              token,
              body: { action: "reschedule", start, artist },
            },
          ),
        };
      else
        result = await bookingApi(
          session ? "/api/admin/appointments" : "/api/booking/reservations",
          {
            method: "POST",
            session,
            body: {
              service,
              artist,
              start,
              ...customer,
              notificationPreferences: {
                inApp: inAppUpdates,
                sms: false,
                whatsapp: false,
              },
            },
          },
        );
      onBooked(result);
    } catch (err) {
      setError(err.message);
      setReview(false);
      setStart("");
      setSlots([]);
      setLoading(true);
      setRefresh((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }
  const selected = catalog?.services.find((s) => s._id === service),
    uniqueSlots = [...new Map(slots.map((s) => [s.start, s])).values()];
  return (
    <div className="booking-ui">
      {error && (
        <div className="booking-error" role="alert">
          {error}
        </div>
      )}
      {!catalog ? (
        <p role="status">
          {loading
            ? "Loading salon services…"
            : "Booking is unavailable. Please try again later."}
        </p>
      ) : (
        <>
          <p className="booking-note">
            Times are shown in <strong>{catalog.timezone}</strong>.{" "}
            {catalog.policy.approvalRequired
              ? "Reservations require salon approval."
              : "Available reservations are confirmed immediately."}
          </p>
          {review ? (
            <section className="booking-review">
              <h2>Review your {reservation ? "new time" : "reservation"}</h2>
              <dl>
                <dt>Service</dt>
                <dd>{selected?.name}</dd>
                <dt>Date & time</dt>
                <dd>{formatTime(start, catalog.timezone)}</dd>
                <dt>Artist</dt>
                <dd>
                  {artist
                    ? catalog.artists.find((a) => a.id === artist)?.name
                    : "Any qualified available artist"}
                </dd>
                {!reservation && (
                  <>
                    <dt>Customer</dt>
                    <dd>
                      {customer.customerName} · {customer.phone}
                    </dd>
                    <dt>Price</dt>
                    <dd>
                      {money(selected.priceMinor, catalog.currency)} ·{" "}
                      {selected.durationMinutes} minutes
                    </dd>
                  </>
                )}
              </dl>
              <p>No payment is collected on this website.</p>
              {!reservation && (
                <p className="booking-note">
                  Private in-app updates are {inAppUpdates ? "enabled" : "paused"}.
                </p>
              )}
              <div className="booking-actions">
                <button className="button" disabled={busy} onClick={submit}>
                  {busy
                    ? "Saving reservation…"
                    : reservation
                      ? "Confirm reschedule"
                      : "Confirm reservation"}
                </button>
                <button
                  className="booking-secondary"
                  disabled={busy}
                  onClick={() => setReview(false)}
                >
                  Back to edit
                </button>
              </div>
            </section>
          ) : (
            <form
              className="booking-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!start) return;
                setReview(true);
              }}
            >
              <label>
                1. Choose a service
                <select
                  required
                  disabled={!!reservation}
                  value={service}
                  onChange={(e) => {
                    reset();
                    setService(e.target.value);
                    setArtist("");
                    if (date && e.target.value) setLoading(true);
                  }}
                >
                  <option value="">Select a service</option>
                  {catalog.services.map((s) => (
                    <option key={s._id} value={s._id} disabled={!s.bookable}>
                      {s.name} · {s.durationMinutes} min ·{" "}
                      {money(s.priceMinor, catalog.currency)}
                      {!s.bookable ? " · Setup needed" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {!catalog.services.length && (
                <p>No active services are available for booking yet.</p>
              )}
              {selected && !selected.bookable && (
                <p className="booking-note" role="status">
                  {!selected.qualifiedArtistCount
                    ? "This service needs an active Artist with this qualification before it can be booked online."
                    : "This service needs a qualified Artist with a recurring shift during salon hours before it can be booked online."}
                </p>
              )}
              {selected && (
                <div className="booking-service-summary">
                  <p className="eyebrow">{selected.category || "General"}</p>
                  {selected.description && <p>{selected.description}</p>}
                  <p>
                    {selected.durationMinutes} minutes ·{" "}
                    {money(selected.priceMinor, catalog.currency)}
                  </p>
                </div>
              )}
              <label>
                2. Preferred artist
                <select
                  value={artist}
                  disabled={!service}
                  onChange={(e) => {
                    reset();
                    setArtist(e.target.value);
                  }}
                >
                  <option value="">Any qualified available artist</option>
                  {catalog.artists
                    .filter((a) => a.services.includes(service))
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                3. Appointment date
                <input
                  type="date"
                  required
                  disabled={!service}
                  value={date}
                  onInput={chooseDate}
                  onChange={chooseDate}
                />
              </label>
              <fieldset className="booking-slots">
                <legend>4. Available times</legend>
                {!date || !service ? (
                  <p>Choose a service and date to see live availability.</p>
                ) : loading ? (
                  <p role="status">Checking availability…</p>
                ) : !uniqueSlots.length ? (
                  <p>
                    No available times for this selection. Try another date or
                    artist.
                  </p>
                ) : (
                  uniqueSlots.map((slot) => (
                    <label key={slot.start}>
                      <input
                        type="radio"
                        name="slot"
                        required
                        value={slot.start}
                        checked={start === slot.start}
                        onChange={() => setStart(slot.start)}
                      />
                      <span>{slotTime(slot.start, catalog.timezone)}</span>
                    </label>
                  ))
                )}
              </fieldset>
              {!reservation && (
                <>
                  <h3>5. Your details</h3>
                  <label>
                    Your name
                    <input
                      required
                      autoComplete="name"
                      maxLength={120}
                      value={customer.customerName}
                      onChange={(e) =>
                        setCustomer({
                          ...customer,
                          customerName: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Phone number
                    <input
                      required
                      type="tel"
                      placeholder="+1 (612) 555-0123"
                      autoComplete="tel"
                      maxLength={25}
                      value={customer.phone}
                      onChange={(e) =>
                        setCustomer({ ...customer, phone: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Notes (optional)
                    <textarea
                      maxLength={1000}
                      rows={3}
                      value={customer.notes}
                      onChange={(e) =>
                        setCustomer({ ...customer, notes: e.target.value })
                      }
                    />
                  </label>
                  <p className="booking-note">
                    Use +1 and your area code for US numbers; international numbers are welcome. This example is not the salon’s phone number.{" "}
                    Your name and phone are shared with authorized salon staff
                    to manage this reservation. Please avoid sensitive
                    information in notes.
                  </p>
                  <label className="notification-toggle">
                    <input
                      type="checkbox"
                      checked={inAppUpdates}
                      onChange={(event) => setInAppUpdates(event.target.checked)}
                    />
                    Keep secure in-app appointment updates in my private link
                  </label>
                </>
              )}
              <p className="booking-note">
                Cancellation:{" "}
                {catalog.policy.cancellationEnabled
                  ? `at least ${catalog.policy.cancellationNoticeHours} hours before your visit`
                  : "contact the salon"}
                . Rescheduling:{" "}
                {catalog.policy.reschedulingEnabled
                  ? `at least ${catalog.policy.reschedulingNoticeHours} hours before your visit`
                  : "contact the salon"}
                .
              </p>
              <button className="button" disabled={!start || loading || busy}>
                Review {reservation ? "new time" : "reservation"}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
