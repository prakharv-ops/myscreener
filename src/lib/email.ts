// Email via Resend's HTTP API (no SDK). Configure RESEND_API_KEY, ALERT_EMAIL_TO, ALERT_EMAIL_FROM.
// Without a key nothing is sent; the caller gets { sent: false, reason }.
export interface EmailResult {
  sent: boolean;
  reason?: string;
}

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.ALERT_EMAIL_TO);

export async function sendEmail(subject: string, html: string, text: string): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL_TO;
  if (!apiKey || !to) return { sent: false, reason: "RESEND_API_KEY / ALERT_EMAIL_TO not set" };
  try {
    const res = await fetch(process.env.RESEND_API_URL ?? "https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.ALERT_EMAIL_FROM ?? "MyScreener <onboarding@resend.dev>",
        to: to.split(",").map((s) => s.trim()).filter(Boolean),
        subject,
        html,
        text,
      }),
    });
    if (!res.ok) return { sent: false, reason: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: (e as Error).message };
  }
}
