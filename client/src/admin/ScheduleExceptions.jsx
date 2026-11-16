import { useEffect, useState } from "react";
import { bookingApi } from "../booking/api";

const path = "/api/admin/schedule-exceptions";

export default function ScheduleExceptions({ session, staff }) {
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState({ staff: "", date: "", available: false, start: "", end: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    bookingApi(path, { signal: controller.signal }).then(setRecords).catch((err) => {
      if (err.name !== "AbortError") setError(err.message);
    });
    return () => controller.abort();
  }, []);
  function change(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const body = form.available ? form : { staff: form.staff, date: form.date, available: false };
      const saved = await bookingApi(path, { method: "PUT", session, body });
      setRecords((previous) => [...previous.filter((record) => record._id !== saved._id), saved]
        .sort((a, b) => a.date.localeCompare(b.date)));
      setMessage("Date exception saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(record) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await bookingApi(`${path}/${record._id}`, { method: "DELETE", session, body: {} });
      setRecords((previous) => previous.filter((item) => item._id !== record._id));
      setMessage("Weekly shift restored for that date.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details>
      <summary>Date exceptions</summary>
      <p>Set a day off or replace one artist’s shift for a date. Salon hours and weekly breaks still apply.</p>
      {error && <p className="admin-alert" role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <form className="admin-form" onSubmit={save}>
        <label>Artist
          <select required value={form.staff} onChange={(e) => change("staff", e.target.value)}>
            <option value="">Choose artist</option>
            {staff.filter((person) => person.active && person.role === "Artist").map((person) => (
              <option key={person.id} value={person.id}>{person.name}</option>
            ))}
          </select>
        </label>
        <label>Date <input type="date" required value={form.date} onChange={(e) => change("date", e.target.value)} /></label>
        <label>
          <select aria-label="Exception type" value={String(form.available)} onChange={(e) => change("available", e.target.value === "true")}>
            <option value="false">Day off</option>
            <option value="true">Custom shift</option>
          </select>
        </label>
        {form.available && ["start", "end"].map((key) => (
          <label key={key}>{key === "start" ? "Start time" : "End time"}
            <input type="time" required value={form[key]} onChange={(e) => change(key, e.target.value)} />
          </label>
        ))}
        <button className="button" disabled={busy}>Save date exception</button>
      </form>
      {records.map((record) => (
        <article className="operations-row" key={record._id}>
          <span>{record.date} · {staff.find((person) => person.id === record.staff)?.name || "Former staff"} · {record.available ? `${record.start}–${record.end}` : "Day off"}</span>
          <button disabled={busy} onClick={() => remove(record)}>Restore weekly shift</button>
        </article>
      ))}
    </details>
  );
}
