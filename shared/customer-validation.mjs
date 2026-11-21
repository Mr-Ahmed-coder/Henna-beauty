export function customerErrors({ customerName, phone, notes = "" } = {}) {
  const errors = {};
  if (typeof customerName !== "string" || !customerName.trim())
    errors.customerName = "Enter your name.";
  else if (customerName.trim().length > 120)
    errors.customerName = "Use 120 characters or fewer.";

  const digits = typeof phone === "string" ? phone.replace(/\D/g, "") : "";
  if (!digits)
    errors.phone = "Enter your phone number.";
  else if (typeof phone !== "string" || phone.length > 64 ||
      !/^\+?[\d\s().-]+$/.test(phone.trim()) || digits.length < 7 || digits.length > 15)
    errors.phone = "Enter a valid phone number, including the country code for international numbers.";

  if (typeof notes !== "string" || notes.length > 1000)
    errors.notes = "Keep notes to 1,000 characters or fewer.";
  return errors;
}
