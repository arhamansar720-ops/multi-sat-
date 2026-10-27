import type { Metadata } from "next";
import { ProsePage } from "@/components/layout/prose-page";
import { PRODUCT } from "@/lib/config";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <ProsePage title="Privacy Policy" updated="October 2026">
      <p>
        This is a template that describes how {PRODUCT.name} is built to handle data. It has not been reviewed by a lawyer or certified against any law (such as COPPA, FERPA, or GDPR). If you operate this app, review and adapt it before publishing.
      </p>
      <h2>Demo mode</h2>
      <p>When no backend is configured, everything you do is stored only in your browser&apos;s local storage. Nothing is sent to a server. Clearing your browser data, or using Settings → Clear data, deletes it.</p>
      <h2>What we collect in connected mode</h2>
      <ul>
        <li>Account: email address and password (stored only as a salted scrypt hash), or an anonymous guest identifier.</li>
        <li>Profile: a display name and username you choose, plus privacy settings.</li>
        <li>Study preferences: exams, optional classes, target date and score, daily goal, focus skills, and time zone.</li>
        <li>Activity: sessions, answers, timing, XP, achievements, friend connections, and multiplayer match results.</li>
      </ul>
      <p>We don&apos;t ask for your real name, birth date, school, or location, and we don&apos;t use advertising or third-party tracking.</p>
      <h2>Who can see what</h2>
      <ul>
        <li>Your answers and study history are visible only to you. Database row-level security enforces this.</li>
        <li>Leaderboards show only your display name, username, and aggregate totals, and only if you leave leaderboard participation on. Guests never appear.</li>
        <li>Accepted friends can see your weekly XP, last active day, and streak, unless you turn off activity sharing.</li>
        <li>Players in a room see your display name, ready status, answers&apos; correctness after each reveal, and scores.</li>
        <li>Your email is never shown to other students.</li>
      </ul>
      <h2>AI and third parties</h2>
      <p>The core app uses no AI service, and no student information is sent to an AI provider. Data is stored in a PostgreSQL database hosted on Render, and the app is hosted on Vercel.</p>
      <h2>Your choices</h2>
      <p>You can export your data as JSON, change privacy settings, or permanently delete your account from Settings. Deleting an account removes its study history, XP, and friend links.</p>
      <h2>Contact</h2>
      <p>Questions: {PRODUCT.supportEmail}</p>
    </ProsePage>
  );
}
