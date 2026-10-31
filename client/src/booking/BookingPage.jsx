import { useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { PageHeading } from "../components/Shared";
import BookingForm from "./BookingForm";
import { bookingApi, formatTime, money, useBookingPolling } from "./api";
import PrivateUpdates from "../notifications/PrivateUpdates";
export default function BookingPage() {
  const location = useLocation(),
    navigate = useNavigate(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmCancel, setConfirmCancel] = useState(false),
    [reschedule, setReschedule] = useState(false),
    [revision, setRevision] = useState(0);
  const params = new URLSearchParams(location.hash.slice(1)),
    reference = params.get("reference"),
    token = params.get("token"),
    initialService = new URLSearchParams(location.search).get("service") || "",
    manage = location.pathname.endsWith("/manage");
  const { data, error: pollError } = useBookingPolling(
    manage && reference && token
      ? "/api/booking/reservations/" + encodeURIComponent(reference)
      : "",
    token,
    revision,
  );
  const details = data?.appointment?.reference === reference ? data.appointment : null,
    policy = data?.policy,
    notifications = data?.notifications || [];
  function booked(result) {
    setRevision((value) => value + 1);
    setReschedule(false);
    setError("");
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
      await bookingApi("/api/booking/reservations/" + reference, {
        method: "PATCH",
        token,
        body: { action: "status", status: "Cancelled" },
      });
      setReschedule(false);
      setConfirmCancel(false);
      setRevision((value) => value + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function savePreferences(notificationPreferences) {
    setBusy(true);
    setError("");
    try {
      await bookingApi(
        "/api/booking/reservations/" + encodeURIComponent(reference) + "/notification-preferences",
        { method: "PUT", token, body: notificationPreferences },
      );
      setRevision((value) => value + 1);
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
        {(error || pollError) && (
          <div className="booking-error" role="alert">
            {error || pollError}
            {pollError && " Automatic refresh will retry; displayed details may be stale."}
          </div>
        )}
        {manage ? (
          details ? (
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
                    : "Your reservation is saved. This page refreshes every 10 seconds."}
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
                  Save this private link. The reference alone does not grant
                  access, and this page shows secure in-app updates.
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
                {details.status === "Pending" && (
                  <p className="booking-note">
                    Your request is awaiting salon approval. Keep this private
                    page available for the confirmation update.
                  </p>
                )}
                {details.status === "Confirmed" && (
                  <p className="booking-note">
                    Please arrive a few minutes before your appointment and
                    check in with reception when you arrive.
                  </p>
                )}
                {details.status === "Checked In" && (
                  <p className="booking-note">You are checked in. Please wait for your artist.</p>
                )}
                {details.status === "In Service" && (
                  <p className="booking-note">Your service is in progress.</p>
                )}
                {details.status === "Completed" && (
                  <p className="booking-note">This appointment has been completed.</p>
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
                <PrivateUpdates
                  notifications={notifications}
                  preferences={details.notificationPreferences}
                  timezone={details.timezone}
                  busy={busy}
                  onPreferenceChange={savePreferences}
                />
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
          <BookingForm initialService={initialService} onBooked={booked} />
        )}
      </section>
    </>
  );
}
