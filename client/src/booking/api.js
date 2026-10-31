export async function bookingApi(
  path,
  { method = "GET", body, token, session, signal } = {},
) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-Booking-Token": token } : {}),
      ...(session ? { "X-CSRF-Token": session.csrf } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "The request could not be completed");
  return data;
}
export function formatTime(value, timezone) {
  return new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
export function money(value, currency) {
  const formatter = new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  });
  const digits = formatter.resolvedOptions().maximumFractionDigits;
  return formatter.format(value / 10 ** digits);
}
