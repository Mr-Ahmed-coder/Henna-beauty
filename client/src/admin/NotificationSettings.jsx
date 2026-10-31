import { useEffect, useState } from "react";
import { bookingApi } from "../booking/api";
export default function NotificationSettings() {
  const [data, setData] = useState(null), [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    bookingApi("/api/admin/notification-settings", { signal: controller.signal }).then(setData)
      .catch((err) => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, []);
  return <section className="operations-panel"><h3>Notification settings</h3>
    {error ? <p role="alert">{error}</p> : !data ? <p role="status">Loading notification settings…</p> : <>
      <p>In-app reminders: {data.reminderHours} hours before a confirmed visit. Tracking refreshes every {data.pollSeconds} seconds.</p>
      <p>{data.message}</p>
      <p>SMS: {data.providers.sms.active ? "Active" : "Inactive"} · WhatsApp: {data.providers.whatsapp.active ? "Active" : "Inactive"}</p>
      <p className="booking-note">These are the existing notification rules. Customers control their preferences through private tracking links. Provider credentials are configured securely on the server.</p>
    </>}
  </section>;
}
