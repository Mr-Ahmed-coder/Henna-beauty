import { useState } from "react";
import { queueApi, useQueuePolling } from "./api";
import "../booking/booking.css";
import "./queue.css";

export default function JoinQueue({ session, onJoined }) {
  const { data, error: loadError } = useQueuePolling("/api/queue/catalog");
  const [service, setService] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const eligible = (item) => session ? item.walkInBookable : item.bookable;
  const services = data?.services ?? [];
  const selected = services.find((item) => item._id === service);
  const unavailable = !data ? "" :
    !data.policy.enabled ? "The queue is paused. Please check with reception." :
    !session && !data.policy.remoteEnabled ? "Online queue entry is paused. Please check with reception." :
    !data.isOpen ? "The queue is closed. You can join during salon hours (Central Time)." :
    !data.acceptingEntries ? "Queue entry has ended for today." :
    !services.some(eligible) ? "No qualified artist has enough time for a queue service today." : "";

  async function submit(event) {
    event.preventDefault();
    if (busy || unavailable || loadError || !selected || !eligible(selected)) return;
    setBusy(true);
    setError("");
    try {
      const digits = phone.replace(/[ ().-]/g, "");
      const normalized = /^\d{10}$/.test(digits) ? "+1" + digits :
        /^1\d{10}$/.test(digits) ? "+" + digits : phone.trim();
      onJoined(await queueApi(
        session ? "/api/admin/queue/tickets" : "/api/queue/tickets",
        { method: "POST", session, body: { service, customerName, phone: normalized } },
      ));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="booking-ui queue-ui">
      {(error || loadError) && <p role="alert" className="booking-error">{error || loadError}</p>}
      {!data ? (
        <p role="status">{loadError ? "Queue unavailable. Retrying automatically." : "Loading the queue…"}</p>
      ) : unavailable ? (
        <p role="status">{unavailable}</p>
      ) : (
        <form className="booking-form" onSubmit={submit}>
          <label>
            Service
            <select required value={service} onChange={(e) => setService(e.target.value)}>
              <option value="">Choose a service</option>
              {services.map((item) => (
                <option key={item._id} value={item._id} disabled={!eligible(item)}>
                  {item.name}{!eligible(item) ? " (unavailable today)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Name
            <input required maxLength={120} autoComplete="name" value={customerName}
              onChange={(e) => setCustomerName(e.target.value)} />
          </label>
          <label>
            Phone number
            <input required type="tel" maxLength={25} autoComplete="tel" value={phone}
              onChange={(e) => setPhone(e.target.value)} />
          </label>
          <p className="booking-note">
            For numbers outside the US, include + and the country code.
            {!session && " Keep your ticket link private and open for updates. No text message is sent."}
          </p>
          <button className="button" disabled={busy || !!loadError || !selected || !eligible(selected)}>
            {busy ? "Creating ticket…" : session ? "Add walk-in" : "Join Queue"}
          </button>
        </form>
      )}
    </div>
  );
}
