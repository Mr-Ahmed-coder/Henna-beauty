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
  const cookieHeader = login.headers.get("set-cookie");
  const cookie = cookieHeader?.split(";")[0];
  if (!cookie || !csrf || !/;\s*HttpOnly\b/i.test(cookieHeader) ||
    !/;\s*SameSite=Strict\b/i.test(cookieHeader)) {
    throw new Error("The demo did not issue a protected staff session.");
  }
  const sessionHeaders = { ...headers, Cookie: cookie, "X-CSRF-Token": csrf };

  let protectedPages;
  let logout;
  try {
    protectedPages = await Promise.all([
      "/api/admin/operations-metrics", "/api/admin/appointments", "/api/admin/services",
    ].map((path) => request(path, { headers: sessionHeaders })));
  } finally {
    logout = await request("/api/admin/auth/logout", {
      method: "POST", headers: sessionHeaders, body: "{}",
    }).catch(() => null);
  }
  if (!logout?.ok) throw new Error("The demo could not close the verification session.");
  if (staff.role !== "Admin" || protectedPages.some((response) => !response.ok)) {
    throw new Error("The demo login could not access the dashboard, appointments, or services.");
  }
  const afterLogout = await request("/api/admin/auth/me", { headers: sessionHeaders });
  if (afterLogout.status !== 401) {
    throw new Error("The demo session was still accepted after logout.");
  }
  return true;
}
