// Usage: npm run alerts   (re-runs alert-enabled saved screens and records entered/exited stocks)
import { runAlerts } from "../src/lib/alerts";

const { summaries: res, email } = await runAlerts();
if (!res.length) console.log("No saved screens have alerts enabled.");
for (const r of res) {
  console.log(`${r.screen}: ${r.matches} matches` + (r.baseline ? " (baseline recorded)" : `, +${r.entered} / -${r.exited}`));
}
if (email) console.log(email.sent ? "Email sent." : `Email NOT sent: ${email.reason}`);
