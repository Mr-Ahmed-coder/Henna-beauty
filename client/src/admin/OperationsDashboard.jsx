import { useEffect, useState } from "react";
import { bookingApi, formatTime } from "../booking/api";
import { useQueuePolling } from "../queue/api";

const activeQueueStatuses = new Set(["Waiting", "Checked In", "Called"]);

export default function OperationsDashboard({ session, onOpen }) {
  const [appointments, setAppointments] = useState(null);
  const [setup, setSetup] = useState(null);
  const [error, setError] = useState("");
  const { data: queue, error: queueError } = useQueuePolling(
    "/api/admin/queue",
  );
  useEffect(() => {
    let active = true;
    Promise.all(
      [
        "/appointments?today=1",
        "/staff",
        "/schedules",
        "/artist-profiles",
        "/services",
        "/settings",
      ].map((path) => bookingApi("/api/admin" + path)),
    )
      .then(([today, staff, schedules, profiles, services, settings]) => {
        if (active) {
          setAppointments(today);
          setSetup({ staff, schedules, profiles, services, settings });
        }
      })
      .catch((err) => active && setError(err.message));
    return () => {
      active = false;
    };
  }, [session.staff.id]);
  const salonDay = queue
      ? new Date(`${queue.date}T12:00:00Z`).getUTCDay()
      : null,
    artists = setup?.staff.filter(
      (person) => person.active && person.role === "Artist",
    ) || [],
    scheduledArtists = artists.filter((artist) =>
      setup?.schedules.some(
        (shift) =>
          shift.staff === artist.id &&
          shift.available &&
          shift.day === salonDay,
      ),
    ),
    configuredServices = setup?.services.filter(
      (service) =>
        service.active &&
        scheduledArtists.some(
          (artist) =>
            setup.profiles
              .find((profile) => profile.staff === artist.id)
              ?.services.includes(service._id),
        ),
    ),
    waiting = queue?.tickets.filter((ticket) => activeQueueStatuses.has(ticket.status)) ||
      [];
  return (
    <section className="operations-dashboard">
      <div className="admin-section-title">
        <div>
          <p className="eyebrow">TODAY AT A GLANCE</p>
          <h2>Salon operations</h2>
        </div>
        {queue && <p>{queue.isOpen ? "Salon open" : "Salon closed"}</p>}
      </div>
      {(error || queueError) && (
        <div className="admin-alert" role="alert">
          {error || queueError}
        </div>
      )}
      {!appointments || !setup ? (
        <p role="status">Loading today’s salon workspace…</p>
      ) : (
        <>
          <div className="operations-summary">
            <article>
              <span>Today’s appointments</span>
              <strong>{appointments.total}</strong>
              <button onClick={() => onOpen("appointments")}>Open appointments</button>
            </article>
            <article>
              <span>Waiting queue</span>
              <strong>{queue ? waiting.length : "—"}</strong>
              <button onClick={() => onOpen("queue")}>Open live queue</button>
            </article>
            <article>
              <span>Artists on shift today</span>
              <strong>{scheduledArtists.length}</strong>
              <button onClick={() => onOpen("schedules")}>Review schedules</button>
            </article>
            <article>
              <span>Services ready to assign</span>
              <strong>{configuredServices.length}</strong>
              <button onClick={() => onOpen("services")}>Manage catalogue</button>
            </article>
          </div>
          <div className="operations-grid">
            <article className="operations-panel">
              <div className="admin-section-title">
                <h3>Today’s appointments</h3>
                <button onClick={() => onOpen("appointments")}>View all</button>
              </div>
              {!appointments.appointments.length ? (
                <p>No appointments are scheduled today.</p>
              ) : (
                appointments.appointments.slice(0, 5).map((appointment) => (
                  <div className="operations-row" key={appointment.reference}>
                    <span>
                      <strong>{appointment.customerName}</strong>
                      {appointment.serviceName} · {appointment.artistName}
                    </span>
                    <span>
                      {formatTime(appointment.start, appointment.timezone)}
                      {appointment.status}
                    </span>
                  </div>
                ))
              )}
            </article>
            <article className="operations-panel">
              <div className="admin-section-title">
                <h3>Live waiting queue</h3>
                <button onClick={() => onOpen("queue")}>Call next</button>
              </div>
              {!queue ? (
                <p>Configure business hours to activate the live queue.</p>
              ) : !waiting.length ? (
                <p>No customers are waiting right now.</p>
              ) : (
                waiting.slice(0, 5).map((ticket) => (
                  <div className="operations-row" key={ticket.reference}>
                    <span>
                      <strong>Q{String(ticket.number).padStart(3, "0")}</strong>
                      {ticket.serviceName} · {ticket.status}
                    </span>
                    <span>{ticket.artistName || "Awaiting artist"}</span>
                  </div>
                ))
              )}
            </article>
          </div>
          <p className="booking-note">
            Artist assignment remains live: appointments, breaks, and current
            queue work are checked before anyone is called or booked.
          </p>
          {!setup.settings || !setup.services.length || !artists.length || !scheduledArtists.length || !configuredServices.length ? (
            <div className="admin-guidance">
              <h3>Finish salon setup</h3>
              <p>
                Online availability needs business hours, an active service, an active Artist, a saved weekly shift, and an Artist service qualification.
              </p>
              <div className="admin-actions">
                <button onClick={() => onOpen("services")}>1. Add services</button>
                <button onClick={() => onOpen("staff")}>2. Add Artists</button>
                <button onClick={() => onOpen("schedules")}>3. Set shifts</button>
                <button onClick={() => onOpen("appointments")}>4. Set qualifications</button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
