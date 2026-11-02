export const salonDefaults = { currency: "USD", timezone: "America/Chicago" };
export function money(value, currency) {
  const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency });
  const digits = formatter.resolvedOptions().maximumFractionDigits;
  return formatter.format(value / 10 ** digits);
}
export function formatTime(value, timezone) {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
export function slotTime(value, timezone) {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(value));
}
export function calendarDate(value) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", dateStyle: "medium" }).format(new Date(`${value}T12:00:00Z`));
}
