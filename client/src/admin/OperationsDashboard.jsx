import { formatTime } from "../booking/api";
import { useQueuePolling } from "../queue/api";

export default function OperationsDashboard({ session, onOpen }) {
  const desk = ["Admin", "Receptionist"].includes(session.staff.role);
  const { data: metrics, error: metricsError } = useQueuePolling("/api/admin/operations-metrics");
  const { data: queue, error: queueError } = useQueuePolling("/api/admin/queue");
  const { data: upcoming, error: appointmentsError } = useQueuePolling("/api/admin/appointments?today=1&upcoming=1");
  const active = queue?.tickets.filter((ticket) => ticket.active) ?? [];
  const countInService = metrics && queue
    ? (metrics.appointmentStatuses["In Service"] ?? 0) +
      active.filter((ticket) => ticket.status === "In Service").length
    : "—";
  return (
    <section className="operations-dashboard" aria-label="Daily operations">
      {desk && (
        <div className="booking-actions">
          <button className="button" onClick={() => onOpen("appointments", "create")}>Add Walk-in</button>
          <button className="button" onClick={() => onOpen("appointments", "create")}>New Booking</button>
        </div>
      )}
      {(metricsError || queueError || appointmentsError) && (
        <p className="admin-alert" role="alert">Could not refresh today’s activity. Retrying automatically.</p>
      )}
      <div className="operations-summary">
        {[
          ["Checked in", metrics?.appointmentStatuses["Checked In"] ?? "—"],
          ["Today’s appointments", metrics?.appointments ?? "—"],
          ["Being served", countInService],
        ].map(([label, count]) => (
          <article key={label}><strong>{count}</strong><span>{label}</span></article>
        ))}
      </div>
      <div className="operations-grid">
        {(queueError || active.length > 0) && (
          <article className="operations-panel">
            <h2>Outstanding tickets</h2>
            <p>{queueError ? "Could not check for outstanding tickets. Please retry before retiring staff queue access." :
              `${active.length} existing visit(s) need attention. Finish or cancel them using the original workflow.`}</p>
            <button onClick={() => onOpen("queue")}>Manage existing tickets</button>
          </article>
        )}
        <article className="operations-panel">
          <div className="admin-section-title">
            <h2>Upcoming today</h2>
            <button onClick={() => onOpen("appointments")}>View Appointments</button>
          </div>
          {!upcoming ? <p>{appointmentsError ? "Appointments unavailable." : "Loading appointments…"}</p> :
            !upcoming.appointments.length ? <p>No upcoming appointments today.</p> :
            upcoming.appointments.slice(0, 5).map((appointment) => (
              <div className="operations-row" key={appointment.reference}>
                <span><strong>{appointment.customerName}</strong>{appointment.serviceName} · {appointment.artistName}</span>
                <span>{formatTime(appointment.start, appointment.timezone)}<br />{appointment.status}</span>
              </div>
            ))}
        </article>
      </div>
    </section>
  );
}
