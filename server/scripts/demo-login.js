export const demoOrigin = "http://127.0.0.2:5180";

export async function verifyDemoLogin(origin, credentials) {
  const request = (path, options) => fetch(origin + path, {
    redirect: "error",
    signal: AbortSignal.timeout(5000),
    ...options,
  });

  const page = await request("/staff");
  if (!page.ok || !(await page.text()).includes('aria-label="Demo notice"')) {
    throw new Error("The demo staff page is unavailable.");
  }

  const headers = { Origin: origin, "Content-Type": "application/json" };
  const login = await request("/api/admin/auth/login", {
    method: "POST", headers, body: JSON.stringify(credentials),
  });
  if (login.status === 401) return false;
  if (!login.ok) throw new Error("The demo login service could not verify the credentials.");
  const { staff, csrf } = await login.json();
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (!cookie || !csrf) throw new Error("The demo did not issue a session.");
  const sessionHeaders = { ...headers, Cookie: cookie, "X-CSRF-Token": csrf };

  let dashboard;
  let logout;
  try {
    dashboard = await request("/api/admin/operations-metrics", { headers: sessionHeaders });
  } finally {
    logout = await request("/api/admin/auth/logout", {
      method: "POST", headers: sessionHeaders, body: "{}",
    }).catch(() => null);
  }
  if (!logout?.ok) throw new Error("The demo could not close the verification session.");
  if (staff.role !== "Admin" || !dashboard.ok) {
    throw new Error("The demo login does not have administrator dashboard access.");
  }
  return true;
}
