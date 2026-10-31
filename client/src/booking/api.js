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
import { useEffect, useState } from "react";
export function useBookingPolling(path, token, revision = 0) {
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (!path || !token) return undefined;
    const controller = new AbortController();
    let timer;
    async function poll() {
      try {
        const result = await bookingApi(path, {
          token,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setData({ result, access: path + ":" + token });
          setError("");
        }
      } catch (err) {
        if (!controller.signal.aborted) setError(err.message);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 10000);
      }
    }
    poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [path, token, revision]);
  return { data: data?.access === path + ":" + token ? data.result : null, error };
}
