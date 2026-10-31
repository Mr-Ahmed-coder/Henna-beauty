import { useEffect, useState } from "react";
import { bookingApi } from "../booking/api";

export default function BusinessReports() {
  const [period, setPeriod] = useState("daily"), [date, setDate] = useState("");
  const [data, setData] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    bookingApi("/api/admin/reports?" + new URLSearchParams({ period, ...(date ? { date } : {}) }), { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) { setData(result); setError(""); } })
      .catch((err) => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [period, date]);
  return <section>
    <h2>Business reports</h2>
    <div className="booking-admin-search">
      <label>Period <select value={period} onChange={(event) => { setLoading(true); setPeriod(event.target.value); }}>
        <option value="daily">Daily</option><option value="weekly">Weekly (Monday–Sunday)</option><option value="monthly">Monthly</option>
      </select></label>
      <label>Date within period <input type="date" value={date} onChange={(event) => { setLoading(true); setDate(event.target.value); }} /></label>
    </div>
    {error && <p className="admin-alert" role="alert">{error}</p>}
    {loading ? <p role="status">Loading report…</p> : !error && data && <>
      <p>{data.start} to {data.endExclusive} (end exclusive) · {data.timezone}</p>
      <p className="booking-note">Appointments are grouped by scheduled start; queue visits by ticket date. Current statuses are shown. Average wait measures queue entry to service start, including travel for remote customers. Revenue is unavailable because payments are not recorded.</p>
      <div className="operations-summary">{[["Appointments", data.appointments], ["Queue visits", data.queueVisits], ["Completed services", data.completedServices], ["Average queue wait", data.averageWaitMinutes === null ? "No samples" : `${data.averageWaitMinutes} min`]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
      {!data.appointments && !data.queueVisits && <p>No visits recorded in this period.</p>}
      <div className="operations-grid">{[["Appointment status", data.appointmentStatuses], ["Queue status", data.queueStatuses]].map(([title, counts]) => <article className="operations-panel" key={title}><h3>{title}</h3>{Object.entries(counts).map(([status, count]) => <p key={status}>{status}: {count}</p>)}</article>)}</div>
      {[["Most-booked services", data.services], ["Staff workload", data.staff]].map(([title, rows]) => <section key={title} className="operations-panel report-panel"><h3>{title}</h3>
        {!rows.length ? <p>No records.</p> : <div className="report-scroll"><table><thead><tr><th>Name</th><th>Appointments</th><th>Queue visits</th><th>Completed</th><th>Allocated minutes</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><th>{row.name || "Former artist"}</th><td>{row.appointments}</td><td>{row.queueVisits}</td><td>{row.completed}</td><td>{row.scheduledMinutes}</td></tr>)}</tbody></table></div>}
      </section>)}
      <section className="operations-panel report-panel"><h3>Queue waiting-time trend</h3><div className="report-scroll"><table><thead><tr><th>Day</th><th>Tickets</th><th>Recorded starts</th><th>Average wait</th></tr></thead><tbody>{data.trend.map((day) => <tr key={day.date}><th>{day.date}</th><td>{day.queueVisits}</td><td>{day.served}</td><td>{day.averageWaitMinutes === null ? "—" : `${day.averageWaitMinutes} min`}</td></tr>)}</tbody></table></div></section>
      <p className="booking-note">Allocated minutes exclude cancelled, missed, and no-show visits. They represent configured durations, not measured working time. Waiting averages use {data.waitSampleCount} recorded service starts.</p>
    </>}
  </section>;
}
