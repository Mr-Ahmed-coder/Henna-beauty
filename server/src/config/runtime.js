export function runtimeConfiguration(environment = process.env) {
  const production = environment.NODE_ENV === "production";
  const port = Number(environment.PORT || 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be an integer between 1 and 65535");
  const trustProxy = Number(environment.TRUST_PROXY_HOPS || 0);
  if (!Number.isInteger(trustProxy) || trustProxy < 0 || trustProxy > 5)
    throw new Error("TRUST_PROXY_HOPS must be an integer between 0 and 5");
  const origins = (environment.CLIENT_ORIGIN || "http://localhost:5173,http://127.0.0.1:5173")
    .split(",").map((value) => value.trim());
  if (production && (!environment.MONGODB_URI || !environment.CLIENT_ORIGIN))
    throw new Error("Production requires MONGODB_URI and CLIENT_ORIGIN");
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (parsed.origin !== origin || parsed.username || parsed.password ||
      !["http:", "https:"].includes(parsed.protocol) || (production && parsed.protocol !== "https:"))
      throw new Error("CLIENT_ORIGIN must contain exact origins; production requires HTTPS");
  }
  const host = environment.HOST || "127.0.0.1";
  if (!["127.0.0.1", "0.0.0.0", "::1", "::"].includes(host))
    throw new Error("HOST must be an explicit loopback or wildcard bind address");
  return { production, port, host, origins, trustProxy };
}
