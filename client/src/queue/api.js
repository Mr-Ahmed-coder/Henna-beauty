import { useEffect, useState } from "react";
export async function queueApi(
  path,
  { method = "GET", body, token, session, signal } = {},
) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-Queue-Token": token } : {}),
      ...(session ? { "X-CSRF-Token": session.csrf } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Queue request failed");
  return data;
}
export function useQueuePolling(path, token, revision = 0) {
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let timer;
    async function poll() {
      try {
        const result = await queueApi(path, {
          token,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setData(result);
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
  return { data, error };
}
