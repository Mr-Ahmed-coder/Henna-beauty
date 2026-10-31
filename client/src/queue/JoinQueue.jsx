import { useState } from "react";
import { queueApi, useQueuePolling } from "./api";
import { money } from "../booking/api";
import "../booking/booking.css";
import "./queue.css";
export default function JoinQueue({ session, onJoined }) {
  const { data, error: loadError } = useQueuePolling("/api/queue/catalog"),
    [service, setService] = useState(""),
    [customer, setCustomer] = useState({
      customerName: "",
      phone: "",
      notes: "",
    }),
    [inAppUpdates, setInAppUpdates] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onJoined(
        await queueApi(
          session ? "/api/admin/queue/tickets" : "/api/queue/tickets",
          {
            method: "POST",
            session,
            body: {
              service,
              ...customer,
              notificationPreferences: {
                inApp: inAppUpdates,
                sms: false,
                whatsapp: false,
              },
            },
          },
        ),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  const accepting =
    data?.acceptingEntries && (session || data.policy.remoteEnabled),
    selectedService = data?.services.find((item) => item._id === service);
  const eligible = (item) => session ? item.walkInBookable : item.bookable;
  return (
    <div className="booking-ui queue-ui">
      {(error || loadError) && (
        <div role="alert" className="booking-error">
          {error || loadError}
        </div>
      )}
      {!data ? (
        <p role="status">
          {loadError
            ? "Queue is unavailable. The page will retry automatically."
            : "Loading today’s queue…"}
        </p>
      ) : (
        <>
          <p>
            Today: <strong>{data.date}</strong> · {data.timezone} ·{" "}
            {data.waitingCount} waiting
          </p>
          <p className="booking-note">
            {accepting
              ? session
                ? "Register an arriving walk-in. Reception check-in is recorded immediately."
                : "Join from home, then keep your private ticket page open."
              : "The queue is not accepting " +
                (session ? "walk-in" : "online") +
                " entries right now."}
          </p>
          <p className="booking-note">
            Tickets update every 10 seconds. Wait estimates are approximate and
            do not reserve an appointment. Remote customers have{" "}
            {data.policy.remoteArrivalMinutes} minutes to arrive after being
            called, plus {data.policy.graceMinutes} minutes’ grace. No
            external messages are sent; private in-app updates appear on your
            ticket link.
          </p>
          <form className="booking-form" onSubmit={submit}>
            <label>
              Service
              <select
                required
                value={service}
                onChange={(e) => setService(e.target.value)}
              >
                <option value="">Choose a service</option>
                {data.services.map((s) => (
                  <option key={s._id} value={s._id} disabled={!eligible(s)}>
                    {s.name} · {s.durationMinutes} min ·{" "}
                    {money(s.priceMinor, data.currency)}
                    {!eligible(s) ? " · Unavailable now" : ""}
                  </option>
                ))}
              </select>
            </label>
            {!data.services.length && <p>No active services are available.</p>}
            {selectedService && !eligible(selectedService) && (
                <p className="booking-note" role="status">
                  This service has no qualified artist available in today’s queue schedule. Choose another service or ask reception.
                </p>
              )}
            {selectedService && (
              <div className="booking-service-summary">
                <p className="eyebrow">
                  {selectedService.category || "General"}
                </p>
                {selectedService.description && <p>{selectedService.description}</p>}
              </div>
            )}
            <label>
              Customer name
              <input
                required
                maxLength={120}
                autoComplete="name"
                value={customer.customerName}
                onChange={(e) =>
                  setCustomer({ ...customer, customerName: e.target.value })
                }
              />
            </label>
            <label>
              Phone number with country code
              <input
                required
                type="tel"
                maxLength={25}
                placeholder="+256 700 123456"
                autoComplete="tel"
                value={customer.phone}
                onChange={(e) =>
                  setCustomer({ ...customer, phone: e.target.value })
                }
              />
            </label>
            <label>
              Notes (optional)
              <textarea
                rows={3}
                maxLength={1000}
                value={customer.notes}
                onChange={(e) =>
                  setCustomer({ ...customer, notes: e.target.value })
                }
              />
            </label>
            <p className="booking-note">
              One active ticket per international phone number. Your contact
              details are visible only through your private link and authorized
              staff access. Please avoid sensitive information in notes.
            </p>
            <label className="notification-toggle">
              <input
                type="checkbox"
                checked={inAppUpdates}
                onChange={(event) => setInAppUpdates(event.target.checked)}
              />
              Keep secure in-app queue updates in this private ticket link
            </label>
            <button
              className="button"
              disabled={busy || !service || !accepting}
            >
              {busy
                ? "Creating ticket…"
                : session
                  ? "Register walk-in"
                  : "Join today’s queue"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
