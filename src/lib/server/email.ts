import { getEmailConfig, PRODUCT } from "@/lib/config";
import { ApiError } from "./errors";

/** Sends a password reset link through Resend (https://resend.com). */
export async function sendPasswordResetEmail(to: string, link: string): Promise<void> {
  const cfg = getEmailConfig();
  if (!cfg) throw new ApiError(503, "email_not_configured", "Password reset emails aren't set up on this deployment.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: cfg.from,
      to: [to],
      subject: `Reset your ${PRODUCT.name} password`,
      text: `Someone (hopefully you) asked to reset your ${PRODUCT.name} password.\n\nChoose a new password here (the link works once and expires in 1 hour):\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
    }),
  });
  if (!res.ok) {
    console.error("[email] reset email failed", res.status, await res.text().catch(() => ""));
    throw new ApiError(502, "email_failed", "We couldn't send the email right now. Please try again in a minute.");
  }
}
