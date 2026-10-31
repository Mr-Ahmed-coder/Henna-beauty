// Configuration contract for a future approved adapter. Configuration alone never
// activates delivery. Secrets stay in the process environment, never visit records.
export function providerConfiguration(environment = process.env) {
  return {
    sms: {
      provider: environment.SMS_PROVIDER || "disabled",
      sender: environment.SMS_SENDER || "",
      credentialConfigured: Boolean(environment.SMS_API_KEY),
      active: false,
    },
    whatsapp: {
      provider: environment.WHATSAPP_PROVIDER || "disabled",
      sender: environment.WHATSAPP_SENDER || "",
      credentialConfigured: Boolean(environment.WHATSAPP_API_KEY),
      active: false,
    },
  };
}
