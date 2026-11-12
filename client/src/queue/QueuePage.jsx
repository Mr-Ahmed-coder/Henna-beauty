import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { PageHeading } from "../components/Shared";
import { formatTime } from "../booking/api";
import { queueApi, useQueuePolling } from "./api";
import JoinQueue from "./JoinQueue";
import PrivateUpdates from "../notifications/PrivateUpdates";
import { calendarDate } from "../localization";
function TicketView({ reference, token }) {
  const [revision, setRevision] = useState(0),
    { data, error: pollError } = useQueuePolling(
      "/api/queue/tickets/" + encodeURIComponent(reference),
      token,
      revision,
    ),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false);
  async function cancel() {
    setBusy(true);
    setError("");
    try {
      await queueApi("/api/queue/tickets/" + encodeURIComponent(reference), {
        method: "PATCH",
        token,
        body: { action: "cancel" },
      });
      setConfirm(false);
      setRevision((n) => n + 1);
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
      await queueApi(
        "/api/queue/tickets/" + encodeURIComponent(reference) + "/notification-preferences",
        { method: "PUT", token, body: notificationPreferences },
      );
      setRevision((n) => n + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  const ticket = data?.ticket;
  return (
    <section className="booking-container container queue-ui">
      {(pollError || error) && (
        <div role="alert" className="booking-error">
          {pollError || error}
          {pollError &&
            " Automatic refresh will retry; any displayed details are from the last successful update."}
        </div>
      )}
      {!ticket ? (
        <p role="status">
          {pollError
            ? "Unable to load this private ticket."
            : "Loading your ticket…"}
        </p>
      ) : (
        <>
          <div className="booking-confirmation">
            <p className="eyebrow">
              {ticket.source} · {calendarDate(ticket.date)}
            </p>
            <h2>Ticket Q{String(ticket.number).padStart(3, "0")}</h2>
            <p className="queue-status" role="status">
              {ticket.status}
            </p>
            <dl>
              <dt>Service</dt>
              <dd>
                {ticket.serviceName} · {ticket.durationMinutes} min
              </dd>
              <dt>Price</dt>
              <dd>Price available in salon</dd>
              <dt>Position</dt>
              <dd>
                {ticket.position
                  ? `${ticket.position} in the waiting queue`
                  : "Called or no longer waiting"}
              </dd>
              <dt>Customers ahead</dt>
              <dd>{ticket.position ? Math.max(0, ticket.position - 1) : "—"}</dd>
              <dt>Approximate wait until called</dt>
              <dd>
                {ticket.position
                  ? ticket.approximateWaitMinutes === null
                    ? "No reliable estimate before closing; ask reception."
                    : `About ${ticket.approximateWaitMinutes} minute(s)`
                  : "—"}
              </dd>
              {ticket.artistName && (
                <>
                  <dt>Artist</dt>
                  <dd>{ticket.artistName}</dd>
                </>
              )}
              {ticket.status === "Called" && (
                <>
                  <dt>Arrival / start deadline</dt>
                  <dd>{formatTime(ticket.deadlineAt, ticket.timezone)}</dd>
                </>
              )}
              <dt>Reference</dt>
              <dd>{ticket.reference}</dd>
            </dl>
            {ticket.status === "Waiting" && (
              <p>
                Keep this page open to watch for your turn. Reception will check
                you in when you arrive.
              </p>
            )}
            {ticket.status === "Checked In" && (
              <p>You are checked in. Please wait for reception to call you.</p>
            )}
            {ticket.status === "Called" && (
              <p>
                {ticket.checkedInAt
                  ? "You have been called. Please be ready for your artist."
                  : "You have been called. Arrive before the deadline and ask reception to check you in."}{" "}
                If service has not started by the deadline, the ticket is marked
                Missed.
              </p>
            )}
            {ticket.status === "Missed" && (
              <p>
                Your arrival/start deadline passed or today’s queue closed. Ask
                reception or join again if entries remain open.
              </p>
            )}
            {ticket.overdue && (
              <p>
                This service is taking longer than estimated. Reception must
                complete it before the artist is reassigned.
              </p>
            )}
            <label className="booking-private">
              Private ticket link — save securely; anyone with it can view and
              cancel this ticket
              <input
                readOnly
                value={window.location.href}
                onFocus={(e) => e.target.select()}
              />
            </label>
            <p className="booking-note">
              Last updated {formatTime(data.serverNow, data.timezone)} · Updates
              every 10 seconds. Positions and wait estimates can change with
              artist availability and appointments.
            </p>
            {["Waiting", "Checked In", "Called"].includes(ticket.status) && (
              <button
                className="booking-secondary"
                disabled={busy}
                onClick={() => setConfirm(true)}
              >
                Cancel ticket
              </button>
            )}
            {confirm && (
              <div role="alert" className="booking-error">
                <p>Cancel your ticket and release your place?</p>
                <div className="booking-actions">
                  <button className="button" disabled={busy} onClick={cancel}>
                    Yes, cancel ticket
                  </button>
                  <button
                    className="booking-secondary"
                    disabled={busy}
                    onClick={() => setConfirm(false)}
                  >
                    Keep ticket
                  </button>
                </div>
              </div>
            )}
            <PrivateUpdates
              notifications={data.notifications}
              preferences={ticket.notificationPreferences}
              timezone={ticket.timezone}
              busy={busy}
              onPreferenceChange={savePreferences}
            />
          </div>
          <Link className="text-link" to="/queue">
            Back to today’s queue
          </Link>
        </>
      )}
    </section>
  );
}
export default function QueuePage() {
  const location = useLocation(),
    navigate = useNavigate(),
    params = new URLSearchParams(location.hash.slice(1)),
    reference = params.get("reference"),
    token = params.get("token"),
    tracking = location.pathname.endsWith("/ticket");
  return (
    <>
      <PageHeading
        title={tracking ? "My Queue Ticket" : "Join Queue"}
      >
        {tracking
          ? "Follow your place and arrival instructions here."
          : "Join online, then check in with reception when you arrive."}
      </PageHeading>
      {tracking ? (
        reference && token ? (
          <TicketView
            key={reference + token}
            reference={reference}
            token={token}
          />
        ) : (
          <section className="booking-container container">
            <p>Open the complete private ticket link issued when you joined.</p>
          </section>
        )
      ) : (
        <section className="booking-container container">
          <JoinQueue
            onJoined={(result) =>
              navigate(
                "/queue/ticket#" +
                  new URLSearchParams({
                    reference: result.ticket.reference,
                    token: result.token,
                  }),
              )
            }
          />
          <Link className="text-link" to="/appointments">
            Book Appointment Instead
          </Link>
        </section>
      )}
    </>
  );
}
