import { useEffect, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { PageHeading } from "../components/Shared";
import BookingForm from "./BookingForm";
import { bookingApi, formatTime, money } from "./api";
export default function BookingPage() {
  const location = useLocation(),
    navigate = useNavigate(),
    [details, setDetails] = useState(null),
    [loadedAccess, setLoadedAccess] = useState(""),
    [policy, setPolicy] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmCancel, setConfirmCancel] = useState(false),
    [reschedule, setReschedule] = useState(false);
  const params = new URLSearchParams(location.hash.slice(1)),
    reference = params.get("reference"),
    token = params.get("token"),
    manage = location.pathname.endsWith("/manage");
  useEffect(() => {
    if (!manage || !reference || !token) return;
    const controller = new AbortController();
    bookingApi("/api/booking/reservations/" + encodeURIComponent(reference), {
      token,
      signal: controller.signal,
    })
      .then((data) => {
        setDetails(data.appointment);
        setLoadedAccess(reference + ":" + token);
        setError("");
        setPolicy(data.policy);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError(err.message);
          setDetails(null);
        }
      });
    return () => controller.abort();
  }, [manage, reference, token]);
  function booked(result) {
    setDetails(result.appointment);
    setReschedule(false);
    setError("");
    if (result.token)
      setLoadedAccess(result.appointment.reference + ":" + result.token);
    if (result.token)
      navigate(
        "/appointments/manage#" +
          new URLSearchParams({
            reference: result.appointment.reference,
            token: result.token,
          }),
      );
  }
  async function cancel() {
    setBusy(true);
    setError("");
    try {
      setDetails(
        await bookingApi("/api/booking/reservations/" + reference, {
          method: "PATCH",
          token,
          body: { action: "status", status: "Cancelled" },
        }),
      );
      setReschedule(false);
      setConfirmCancel(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="A LITTLE TIME FOR YOU"
        title={
          <>
            Your next <em>beauty ritual.</em>
          </>
        }
      >
        {manage
          ? "Keep your private access link to view or manage your reservation."
          : "Choose a service, find your time, and reserve your salon visit."}
      </PageHeading>
      <section className="booking-container container">
        {error && (
          <div className="booking-error" role="alert">
            {error}
          </div>
        )}
        {manage ? (
          details && loadedAccess === reference + ":" + token ? (
            <>
              <div className="booking-confirmation">
                <p className="eyebrow">
                  RESERVATION {details.status.toUpperCase()}
                </p>
                <h2>{details.reference}</h2>
                <p>
                  {details.status === "Pending"
                    ? "Your request is saved and awaiting salon approval."
                    : details.status === "Cancelled"
                      ? "Your reservation has been cancelled."
                      : "Your reservation is saved."}
                </p>
                <dl>
                  <dt>Service</dt>
                  <dd>{details.serviceName}</dd>
                  <dt>Artist</dt>
                  <dd>{details.artistName}</dd>
                  <dt>Time</dt>
                  <dd>
                    {formatTime(details.start, details.timezone)} (
                    {details.timezone})
                  </dd>
                  <dt>Duration</dt>
                  <dd>{details.durationMinutes} minutes</dd>
                  <dt>Price</dt>
                  <dd>{money(details.priceMinor, details.currency)}</dd>
                  <dt>Customer</dt>
                  <dd>
                    {details.customerName} · {details.phone}
                  </dd>
                  {details.notes && (
                    <>
                      <dt>Notes</dt>
                      <dd>{details.notes}</dd>
                    </>
                  )}
                </dl>
                <label className="booking-private">
                  Private access link — save this securely; anyone with it can
                  view your booking
                  <input
                    readOnly
                    value={window.location.href}
                    onFocus={(e) => e.target.select()}
                  />
                </label>
                <p className="booking-note">
                  No notification has been sent. Save the reference and private
                  link. The reference alone does not grant access.
                </p>
                {policy && (
                  <p className="booking-note">
                    Customer cancellation:{" "}
                    {policy.cancellationEnabled
                      ? `${policy.cancellationNoticeHours} hours’ notice`
                      : "disabled"}
                    . Rescheduling:{" "}
                    {policy.reschedulingEnabled
                      ? `${policy.reschedulingNoticeHours} hours’ notice`
                      : "disabled"}
                    . Changes are checked against current salon rules.
                  </p>
                )}
                {["Pending", "Confirmed"].includes(details.status) && (
                  <div className="booking-actions">
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => setReschedule(!reschedule)}
                    >
                      Choose a new time
                    </button>
                    <button
                      className="booking-secondary"
                      disabled={busy}
                      onClick={() => setConfirmCancel(true)}
                    >
                      {busy ? "Updating…" : "Cancel reservation"}
                    </button>
                  </div>
                )}
                {confirmCancel &&
                  ["Pending", "Confirmed"].includes(details.status) && (
                    <div role="alert" className="booking-error">
                      <p>
                        Cancel this reservation? Your time will be released.
                      </p>
                      <div className="booking-actions">
                        <button
                          className="button"
                          disabled={busy}
                          onClick={cancel}
                        >
                          Yes, cancel reservation
                        </button>
                        <button
                          className="booking-secondary"
                          disabled={busy}
                          onClick={() => setConfirmCancel(false)}
                        >
                          Keep reservation
                        </button>
                      </div>
                    </div>
                  )}
              </div>
              {reschedule && (
                <BookingForm
                  key={details.updatedAt}
                  reservation={details}
                  token={token}
                  onBooked={booked}
                />
              )}
              <Link
                className="text-link"
                to="/appointments"
                onClick={() => {
                  setDetails(null);
                  setError("");
                }}
              >
                Book another visit
              </Link>
            </>
          ) : (
            <p role="status">
              {!reference || !token
                ? "Open the full private access link issued with your reservation."
                : error
                  ? "Unable to load this reservation."
                  : "Loading your reservation…"}
            </p>
          )
        ) : (
          <BookingForm onBooked={booked} />
        )}
      </section>
    </>
  );
}
