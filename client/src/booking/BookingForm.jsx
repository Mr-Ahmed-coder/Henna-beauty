import { useEffect, useId, useState } from "react";
import { customerErrors } from "../../../shared/customer-validation.mjs";
import { bookingApi, formatTime, serviceUnavailableReason } from "./api";
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
      phone: "",
      notes: "",
    }),
    [inAppUpdates, setInAppUpdates] = useState(true),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState(false),
    [refresh, setRefresh] = useState(0);
  const detailsId = useId();
  const [touched, setTouched] = useState({});
  const [serverFields, setServerFields] = useState({});
  const validation = customerErrors(customer);
  const fieldError = (key) => serverFields[key] || (touched[key] ? validation[key] : "");
  function changeCustomer(key, value) {
    setCustomer((previous) => ({ ...previous, [key]: value }));
    setServerFields((previous) => ({ ...previous, [key]: undefined }));
  }
  function validateDetails() {
    if (reservation) return true;
    setTouched({ customerName: true, phone: true, notes: true });
    return !Object.keys(validation).length && !Object.values(serverFields).some(Boolean);
  }
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
    if (event.target.value === date) return;
    reset();
    setDate(event.target.value);
    setLoading(Boolean(event.target.value && service));
  }
  async function submit() {
    if (busy) return;
    if (!validateDetails()) {
      setReview(false);
      return;
    }
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
      if (err.fieldErrors && Object.keys(err.fieldErrors).length) {
        setServerFields(err.fieldErrors);
      } else {
        setError(err.message);
      }
      setReview(false);
      if (err.status === 409) {
        setStart("");
        setSlots([]);
        setLoading(true);
        setRefresh((n) => n + 1);
      }
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
              <h2>Review your {reservation ? "new time" : "booking"}</h2>
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
                    <dt>Duration & Price</dt>
                    <dd>
                      {selected.durationMinutes} minutes · Price available in salon
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
                      : "Confirm Booking"}
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
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                if (!validateDetails() || !start) return;
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
                      {s.name} · {s.durationMinutes} min
                      {!s.bookable && ` · ${serviceUnavailableReason(s)}`}
                    </option>
                  ))}
                </select>
              </label>
              {!catalog.services.length && (
                <p>No active services are available for booking yet.</p>
              )}
              {!reservation && catalog.services.length > 0 &&
                !catalog.services.some((item) => item.bookable) && (
                  <p role="status">Online booking needs a qualified artist with working hours. Please check back once the salon has updated its schedule.</p>
              )}
              {selected && !selected.bookable && (
                <p className="booking-note" role="status">
                  {serviceUnavailableReason(selected)}.
                </p>
              )}
              {selected && (
                <div className="booking-service-summary">
                  <p className="eyebrow">{selected.category || "General"}</p>
                  {selected.description && <p>{selected.description}</p>}
                  <p>
                    {selected.durationMinutes} minutes · Price available in salon
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
                  min={catalog.firstDate}
                  max={catalog.lastDate}
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
                    No qualified artist has an available time for this selection. Try another date or artist.
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
                      aria-label="Your name"
                      maxLength={120}
                      value={customer.customerName}
                      aria-invalid={Boolean(fieldError("customerName"))}
                      aria-describedby={fieldError("customerName") ? detailsId + "-name-error" : undefined}
                      onBlur={() => setTouched((previous) => ({ ...previous, customerName: true }))}
                      onChange={(e) => changeCustomer("customerName", e.target.value)}
                    />
                    {fieldError("customerName") && <span className="booking-field-error" id={detailsId + "-name-error"}>{fieldError("customerName")}</span>}
                  </label>
                  <label>
                    Phone number
                    <input
                      required
                      type="tel"
                      placeholder="+1 (612) 800-4944"
                      autoComplete="tel"
                      aria-label="Phone number"
                      maxLength={64}
                      value={customer.phone}
                      aria-invalid={Boolean(fieldError("phone"))}
                      aria-describedby={fieldError("phone") ? detailsId + "-phone-error" : undefined}
                      onBlur={() => setTouched((previous) => ({ ...previous, phone: true }))}
                      onChange={(e) => changeCustomer("phone", e.target.value)}
                    />
                    {fieldError("phone") && <span className="booking-field-error" id={detailsId + "-phone-error"}>{fieldError("phone")}</span>}
                  </label>
                  <label>
                    Notes (optional)
                    <textarea
                      aria-label="Notes (optional)"
                      maxLength={1000}
                      rows={3}
                      value={customer.notes}
                      aria-invalid={Boolean(fieldError("notes"))}
                      aria-describedby={fieldError("notes") ? detailsId + "-notes-error" : undefined}
                      onBlur={() => setTouched((previous) => ({ ...previous, notes: true }))}
                      onChange={(e) => changeCustomer("notes", e.target.value)}
                    />
                    {fieldError("notes") && <span className="booking-field-error" id={detailsId + "-notes-error"}>{fieldError("notes")}</span>}
                  </label>
                  <p className="booking-note">
                    Use +1 for US numbers or another international country code. The example isn’t a salon contact. Only authorized staff and anyone with your private link can view your details. Please leave sensitive information out of notes.
                  </p>
                  <label className="notification-toggle">
                    <input
                      type="checkbox"
                      checked={inAppUpdates}
                      onChange={(event) => setInAppUpdates(event.target.checked)}
                    />
                    Receive updates on my private booking page
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
                Review {reservation ? "new time" : "booking"}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
