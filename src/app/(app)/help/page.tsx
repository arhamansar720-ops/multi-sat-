import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/layout/prose-page";
import { QUESTIONS } from "@/lib/content/bank";
import { PRODUCT } from "@/lib/config";

export const metadata: Metadata = { title: "Help" };

export default function HelpPage() {
  return (
    <ProsePage title="Help">
      <h2>Where is my progress saved?</h2>
      <p>
        In demo mode, or when you aren&apos;t signed in, progress is saved in this browser only. When you sign in (or continue as a guest on a connected deployment), it&apos;s saved to your account. The banner at the top of the app always tells you which.
      </p>
      <h2>How do study modes work?</h2>
      <ul>
        <li><strong>Quick Practice</strong>: 5, 10, or 20 questions with optional timer and feedback after each question or at the end.</li>
        <li><strong>Focus Mode</strong>: one skill, with hints and explanations after each question.</li>
        <li><strong>Timed Challenge</strong>: ten questions, scored 100 per correct answer plus a small bonus for time left. Personal bests are tracked.</li>
        <li><strong>Review</strong>: retry incorrect, marked, saved, and due questions.</li>
        <li><strong>Daily Challenge</strong>: the same five questions for everyone each UTC day, with a once-a-day bonus.</li>
        <li><strong>Exam Simulation</strong>: section-by-section practice with a time limit. It&apos;s independent practice, not an official test, and doesn&apos;t produce a predicted score.</li>
      </ul>
      <h2>Keyboard shortcuts</h2>
      <p>In a session: A–F select a choice, ← and → move between questions, M marks for review, and ? shows the list.</p>
      <h2>How does multiplayer work?</h2>
      <p>
        The host creates a private room and shares the six-character code or invite link. Everyone answers the same questions at the same time; the server checks every answer, rejects duplicates, and reveals the correct answer when time runs out or everyone has answered. Without a connected backend, you can try a local demo match against clearly labeled practice bots.
      </p>
      <h2>What content is included?</h2>
      <p>
        The bank has {QUESTIONS.length} original questions. SAT, PSAT, AP Statistics, AP Environmental Science, APUSH, and AP English Language have core sets; AP Computer Science Principles, Biology, Chemistry, and Physics 1 have small starter sets. Free-response and essay practice aren&apos;t included yet.
      </p>
      <h2>Still stuck?</h2>
      <p>
        Email {PRODUCT.supportEmail} or start fresh from the <Link href="/study" className="text-primary underline">study page</Link>.
      </p>
    </ProsePage>
  );
}
