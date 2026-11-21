import { test } from "node:test";
import assert from "node:assert/strict";
import { customerErrors } from "../../shared/customer-validation.mjs";
import { customerData } from "../src/booking/engine.js";
import { bookingApi } from "../../client/src/booking/api.js";

test("customer details identify each invalid field and allow empty notes", () => {
  assert.deepEqual(customerErrors({ customerName: "", phone: "", notes: "" }), {
    customerName: "Enter your name.", phone: "Enter your phone number.",
  });
  const invalid = customerErrors({ customerName: "   ", phone: "+1 ", notes: "x".repeat(1001) });
  assert.deepEqual(Object.keys(invalid), ["customerName", "phone", "notes"]);
  assert.deepEqual(customerErrors({ customerName: "Amina", phone: "+256 700 123 456" }), {});
  assert.deepEqual(customerErrors({ customerName: "Amina", phone: "+256 700 123 456", notes: "" }), {});
  assert.equal(customerErrors({ customerName: "x".repeat(121), phone: "6128004944" }).customerName, "Use 120 characters or fewer.");
});

test("international formatting normalizes before the existing model validation", () => {
  for (const [phone, normalized] of [
    ["+1 (612) 800-4944", "+16128004944"],
    ["+44 20 7946 0958", "+442079460958"],
    ["+256.700.123.456", "+256700123456"],
    [" +252 61 234 5678 ", "+252612345678"],
    ["+253 77 12 34 56", "+25377123456"],
    ["612-800-4944", "6128004944"],
  ]) {
    assert.deepEqual(customerData({ customerName: " Amina ", phone }), {
      customerName: "Amina", phone: normalized, notes: "",
    });
  }
  for (const phone of ["abc1234567", "12", "+1234567890123456", "++256700123456", "1234567x89"]) {
    assert.ok(customerErrors({ customerName: "Amina", phone }).phone);
  }
  assert.throws(() => customerData({ customerName: "", phone: "123" }), (error) =>
    error.status === 400 && Boolean(error.fieldErrors.customerName) && Boolean(error.fieldErrors.phone));
});

test("booking API preserves field errors, conflicts, server failures and malformed responses", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  for (const [status, body] of [
    [400, { error: "Check your contact details.", fieldErrors: { phone: "Enter a valid phone number." } }],
    [409, { error: "This time is no longer available." }],
    [503, { error: "Booking requires a connected database." }],
  ]) {
    globalThis.fetch = async () => new Response(JSON.stringify(body), { status });
    await assert.rejects(bookingApi("/test"), (error) =>
      error.message === body.error && error.status === status &&
      JSON.stringify(error.fieldErrors) === JSON.stringify(body.fieldErrors));
  }
  globalThis.fetch = async () => new Response("<html>Unavailable</html>", { status: 502 });
  await assert.rejects(bookingApi("/test"), /Booking request failed \(502\)/);
  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
  await assert.rejects(bookingApi("/test"), /Failed to fetch/);
  globalThis.fetch = async () => new Response(JSON.stringify({ appointment: { reference: "TEST" } }));
  assert.equal((await bookingApi("/test")).appointment.reference, "TEST");
});
