import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
test("API reports health, restricts CORS and exposes no booking endpoints", async (t) => {
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${url}/api/health`, {
    headers: { Origin: "https://untrusted.example" },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ok",
    service: "salon-api",
    database: "not-configured",
  });
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal(response.headers.get("x-powered-by"), null);
  const ready = await fetch(`${url}/api/ready`);
  assert.equal(ready.status, 503);
  assert.equal((await ready.json()).bookingsReady, false);
  for (const route of ["appointments", "queue", "payments", "auth"])
    assert.equal(
      (await fetch(`${url}/api/${route}`, { method: "POST" })).status,
      404,
    );
});
