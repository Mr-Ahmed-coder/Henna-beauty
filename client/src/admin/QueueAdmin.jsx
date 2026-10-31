import { useEffect, useState } from "react";
import { queueApi, useQueuePolling } from "../queue/api";
import JoinQueue from "../queue/JoinQueue";
import { formatTime } from "../booking/api";
function PolicyForm({ session }) {
  const [policy, setPolicy] = useState(null),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    queueApi("/api/admin/queue-policy", { signal: controller.signal })
      .then(setPolicy)
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message);
      });
    return () => controller.abort();
  }, []);
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setSaved(false);
    setError("");
    try {
      const {
        enabled,
        remoteEnabled,
        remoteArrivalMinutes,
        graceMinutes,
        joinCutoffMinutes,
        maxActiveTickets,
      } = policy;
      setPolicy(
        await queueApi("/api/admin/queue-policy", {
          method: "PUT",
          session,
          body: {
            enabled,
            remoteEnabled,
            remoteArrivalMinutes,
            graceMinutes,
            joinCutoffMinutes,
            maxActiveTickets,
          },
        }),
      );
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h3>Queue operating rules</h3>
      {error && (
        <div role="alert" className="booking-error">
          {error}
        </div>
      )}
      {saved && <p role="status">Queue rules saved.</p>}
      {!policy ? (
        <p>Loading rules…</p>
      ) : (
        <form className="queue-policy-form" onSubmit={save}>
          {[
            ["enabled", "Accept queue entries and calls"],
            ["remoteEnabled", "Allow online entries"],
          ].map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={policy[key]}
                onChange={(e) =>
                  setPolicy({ ...policy, [key]: e.target.checked })
                }
              />
              {label}
            </label>
          ))}
          {[
            ["remoteArrivalMinutes", "Remote arrival window (minutes)", 0, 180],
            ["graceMinutes", "Call/start grace period (minutes)", 1, 60],
            [
              "joinCutoffMinutes",
              "Stop entries before closing (minutes)",
              0,
              180,
            ],
            ["maxActiveTickets", "Maximum active tickets today", 1, 200],
          ].map(([key, label, min, max]) => (
            <label key={key}>
              {label}
              <input
                required
                type="number"
                min={min}
                max={max}
                value={policy[key]}
                onChange={(e) =>
                  setPolicy({ ...policy, [key]: Number(e.target.value) })
                }
              />
            </label>
          ))}
          <p className="booking-note">
            Remote calls hold the artist for arrival + grace + service duration.
            Existing deadlines remain unchanged when rules are edited. The queue
            cannot displace appointments or breaks.
          </p>
          <button className="button" disabled={busy}>
            Save queue rules
          </button>
        </form>
      )}
    </section>
  );
}
export default function QueueAdmin({ session }) {
  const [revision, setRevision] = useState(0),
    { data, error: pollError } = useQueuePolling(
      "/api/admin/queue",
      undefined,
      revision,
    ),
    [mode, setMode] = useState("board"),
    [staff, setStaff] = useState([]),
    [artist, setArtist] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState(null),
    [privateLink, setPrivateLink] = useState("");
  const desk = ["Admin", "Receptionist"].includes(session.staff.role);
  useEffect(() => {
    let active = true;
    queueApi("/api/admin/staff")
      .then((people) => {
        if (active)
          setStaff(
            people.filter(
              (person) => person.active && person.role === "Artist",
            ),
          );
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function act(path, method, body) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await queueApi(path, { method, session, body });
      setPending(null);
      setMessage(
        `Ticket Q${String(result.number).padStart(3, "0")} · ${result.status}`,
      );
      setRevision((n) => n + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  function tab(value) {
    setMode(value);
    setPending(null);
    setError("");
    setMessage("");
    setPrivateLink("");
  }
  return (
    <section>
      <h2>Today’s hybrid queue</h2>
      <div className="queue-board-tools">
        <button onClick={() => tab("board")}>Queue board</button>
        {desk && (
          <button onClick={() => tab("walk-in")}>Register walk-in</button>
        )}
        {session.staff.role === "Admin" && (
          <button onClick={() => tab("policy")}>Queue rules</button>
        )}
      </div>
      {(error || pollError) && (
        <div role="alert" className="booking-error">
          {error || pollError}
          {pollError &&
            " Automatic refresh will retry; displayed details may be out of date."}
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {privateLink && (
        <label className="booking-private">
          Private customer ticket link — share securely
          <input
            readOnly
            value={privateLink}
            onFocus={(e) => e.target.select()}
          />
        </label>
      )}
      {pending && (
        <div role="alert" className="booking-error">
          <p>
            {pending.action} ticket Q
            {String(pending.ticket.number).padStart(3, "0")}?
          </p>
          <div className="booking-actions">
            <button
              disabled={busy}
              onClick={() =>
                act(
                  "/api/admin/queue/tickets/" + pending.ticket.reference,
                  "PATCH",
                  { action: pending.action },
                )
              }
            >
              Confirm queue action
            </button>
            <button disabled={busy} onClick={() => setPending(null)}>
              Keep current status
            </button>
          </div>
        </div>
      )}
      {mode === "policy" ? (
        <PolicyForm session={session} />
      ) : mode === "walk-in" ? (
        <JoinQueue
          session={session}
          onJoined={(result) => {
            setMode("board");
            setMessage(
              `Walk-in Q${String(result.ticket.number).padStart(3, "0")} registered and checked in.`,
            );
            setPrivateLink(
              window.location.origin +
                "/queue/ticket#" +
                new URLSearchParams({
                  reference: result.ticket.reference,
                  token: result.token,
                }),
            );
            setRevision((n) => n + 1);
          }}
        />
      ) : !data ? (
        <p role="status">
          {pollError ? "Queue unavailable." : "Loading live queue…"}
        </p>
      ) : (
        <>
          <p>
            {data.date} · {data.timezone} · {data.waitingCount} waiting ·{" "}
            {data.isOpen ? "Salon open" : "Salon closed"}
          </p>
          <p className="booking-note">
            Updates every 10 seconds. Last updated{" "}
            {formatTime(data.serverNow, data.timezone)}. Oldest eligible ticket
            is called first; qualifications, breaks, and protected appointments
            can cause later eligible tickets to be served sooner. Waiting
            estimates are provisional.
          </p>
          {desk && (
            <div className="queue-board-tools">
              <select
                aria-label="Artist for next call"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
              >
                <option value="">Any available qualified artist</option>
                {staff.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
              <button
                className="button"
                disabled={busy || !data.isOpen || !data.policy.enabled}
                onClick={() =>
                  act(
                    "/api/admin/queue/call-next",
                    "POST",
                    artist ? { artist } : {},
                  )
                }
              >
                {busy ? "Assigning…" : "Call next eligible customer"}
              </button>
            </div>
          )}
          {!data.tickets.length && <p>No queue tickets to show today.</p>}
          {data.tickets.map((ticket) => (
            <article className="queue-board-card" key={ticket.reference}>
              <p className="eyebrow">
                Q{String(ticket.number).padStart(3, "0")} · {ticket.source} ·{" "}
                {ticket.status}
              </p>
              <h3>
                {ticket.customerName} · {ticket.serviceName}
              </h3>
              <p>
                {ticket.phone} · {ticket.durationMinutes} min
                {ticket.artistName ? " · " + ticket.artistName : ""}
              </p>
              {ticket.notes && <p>Notes: {ticket.notes}</p>}
              {ticket.position && (
                <p>
                  Position {ticket.position} ·{" "}
                  {ticket.approximateWaitMinutes === null
                    ? "No reliable wait estimate before closing"
                    : `About ${ticket.approximateWaitMinutes} minutes until called`}
                </p>
              )}
              {ticket.deadlineAt && ticket.status === "Called" && (
                <p>
                  {ticket.checkedInAt
                    ? "Checked in"
                    : "Not yet physically checked in"}{" "}
                  · Start / arrival deadline:{" "}
                  {formatTime(ticket.deadlineAt, ticket.timezone)}
                </p>
              )}
              {ticket.status === "In Service" && (
                <p>
                  Estimated finish: {formatTime(ticket.end, ticket.timezone)}
                </p>
              )}
              {ticket.overdue && (
                <p className="queue-overdue">
                  Overdue service: complete or cancel this service before
                  assigning more work to this artist. Appointments retain their
                  protected times.
                </p>
              )}
              <div className="booking-actions">
                {desk &&
                  ["Waiting", "Called"].includes(ticket.status) &&
                  !ticket.checkedInAt && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        act(
                          "/api/admin/queue/tickets/" + ticket.reference,
                          "PATCH",
                          { action: "check-in" },
                        )
                      }
                    >
                      Check in customer
                    </button>
                  )}
                {ticket.status === "Called" && ticket.checkedInAt && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      act(
                        "/api/admin/queue/tickets/" + ticket.reference,
                        "PATCH",
                        { action: "start" },
                      )
                    }
                  >
                    Start service
                  </button>
                )}
                {ticket.status === "In Service" && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      act(
                        "/api/admin/queue/tickets/" + ticket.reference,
                        "PATCH",
                        { action: "complete" },
                      )
                    }
                  >
                    Complete service
                  </button>
                )}
                {desk && ticket.active && (
                  <button
                    disabled={busy}
                    onClick={() => setPending({ ticket, action: "cancel" })}
                  >
                    Cancel ticket
                  </button>
                )}
                {desk && ticket.status === "Called" && (
                  <button
                    disabled={
                      busy ||
                      Date.parse(data.serverNow) < Date.parse(ticket.deadlineAt)
                    }
                    onClick={() => setPending({ ticket, action: "missed" })}
                  >
                    Mark missed
                  </button>
                )}
              </div>
            </article>
          ))}
        </>
      )}
    </section>
  );
}
