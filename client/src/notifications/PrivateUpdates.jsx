import { formatTime } from "../booking/api";

export default function PrivateUpdates({
  notifications = [],
  preferences,
  timezone,
  busy,
  onPreferenceChange,
}) {
  const inApp = preferences?.inApp !== false;
  return (
    <section className="private-updates" aria-live="polite">
      <div className="private-updates-heading">
        <div>
          <p className="eyebrow">PRIVATE UPDATES</p>
          <h3>Visit notifications</h3>
        </div>
        <span>In this private link</span>
      </div>
      <label className="notification-toggle">
        <input
          type="checkbox"
          checked={inApp}
          disabled={busy}
          onChange={(event) =>
            onPreferenceChange?.({
              inApp: event.target.checked,
              sms: preferences?.sms === true,
              whatsapp: preferences?.whatsapp === true,
            })
          }
        />
        Keep in-app status updates enabled
      </label>
      <p className="booking-note">
        SMS and WhatsApp are not active. No external message will be sent until
        the salon approves and configures a provider.
      </p>
      {!inApp ? (
        <p className="booking-note">New in-app notices are paused. Your live visit status still updates here.</p>
      ) : !notifications.length ? (
        <p className="booking-note">Updates will appear here when your visit changes.</p>
      ) : (
        <ol className="notification-feed">
          {notifications.map((notification) => (
            <li key={notification.id}>
              <strong>{notification.title}</strong>
              <span>{notification.message}</span>
              <small>
                {notification.deliveredAt
                  ? formatTime(notification.deliveredAt, timezone)
                  : notification.state === "Scheduled"
                    ? `Scheduled for ${formatTime(notification.scheduledFor, timezone)}`
                    : notification.state}
              </small>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
