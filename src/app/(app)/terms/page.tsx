import type { Metadata } from "next";
import { ProsePage } from "@/components/layout/prose-page";
import { PRODUCT } from "@/lib/config";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <ProsePage title="Terms of Use" updated="October 2026">
      <p>This is a starting template, not legal advice. Operators should have it reviewed before launch.</p>
      <h2>The service</h2>
      <p>
        {PRODUCT.name} provides original practice questions, study tools, and multiplayer quiz games. {PRODUCT.disclaimer} Practice results, readiness indicators, and challenge scores are not official scores and do not predict official results.
      </p>
      <h2>Your account</h2>
      <ul>
        <li>Keep your password private. You&apos;re responsible for activity on your account.</li>
        <li>Choose display names and usernames that are respectful and don&apos;t impersonate anyone.</li>
        <li>Don&apos;t attempt to manipulate scores, XP, or leaderboards, overload the service, or access other students&apos; data.</li>
      </ul>
      <h2>Content</h2>
      <p>Questions and explanations are original works created for this app. Don&apos;t submit or share official, secure, or copyrighted test material through the app.</p>
      <h2>Availability</h2>
      <p>The service is provided as is, without warranties. Features may change. We may suspend accounts that break these terms.</p>
    </ProsePage>
  );
}
