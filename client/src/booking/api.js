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
  let data;
  try {
    data = await response.json();
  } catch {
    throw Object.assign(new Error(response.ok
      ? "The server returned an unreadable response. Please try again."
      : `Booking request failed (${response.status}). Please try again.`), { status: response.status });
  }
  if (!response.ok)
    throw Object.assign(new Error(data.error || "The request could not be completed"), {
      status: response.status, fieldErrors: data.fieldErrors,
    });
  return data;
}
export { formatTime, money } from "../localization.js";
export function serviceUnavailableReason(service) {
  return service.qualifiedArtistCount
    ? "No booking hours for this service"
    : "No qualified artist assigned";
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
