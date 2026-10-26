import { ArrowRight, BarChart3, BookOpen, Check, Flame, Flag, Swords, Timer, Trophy, Users, Zap } from "lucide-react";
import Link from "next/link";
import { LandingHeader } from "@/components/landing/landing-header";
import { ModeBanner } from "@/components/layout/mode-banner";
import { SiteFooter } from "@/components/layout/site-footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trackCounts } from "@/lib/content/bank";
import { TRACKS } from "@/lib/content/catalog";
import { directoryCourseForTrack } from "@/lib/content/course-directory";
import { testsForTrack } from "@/lib/content/tests";
import { PRODUCT } from "@/lib/config";

export default function LandingPage() {
  const counts = trackCounts();
  return (
    <div className="flex min-h-dvh flex-col">
      <ModeBanner />
      <LandingHeader />
      <main id="main" className="flex-1">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 md:grid-cols-[1.05fr_1fr] md:pt-20">
          <div className="space-y-6">
            <Badge variant="violet">SAT · PSAT · AP practice</Badge>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{PRODUCT.tagline}</h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
              Your next score improvement starts here. Practice for the SAT, master your AP classes, and challenge your friends along the way.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/study">
                  Start studying <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/play">
                  <Swords /> Play with friends
                </Link>
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">No account needed to start. Every question is original and comes with a full explanation.</p>
          </div>
          <ExamPreview />
        </section>

        {/* Exams */}
        <section aria-labelledby="exams-heading" className="border-y bg-card/50">
          <div className="mx-auto max-w-6xl space-y-6 px-4 py-14">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
              <div>
                <h2 id="exams-heading" className="text-2xl font-semibold tracking-tight">Pick your exam</h2>
                <p className="text-muted-foreground">Coverage is listed honestly. Starter sets are small and growing.</p>
              </div>
              <Link href="/courses" className="text-sm font-medium text-primary hover:underline">
                Search all SAT and AP courses →
              </Link>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {TRACKS.map((t) => (
                <li key={t.slug}>
                  <Link href={`/courses/${directoryCourseForTrack(t.slug)?.slug ?? t.slug}`} className="group flex h-full flex-col gap-2 rounded-2xl border bg-card p-4 shadow-card transition-colors hover:border-primary/40">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">{t.program}</span>
                      <Badge variant={t.coverage === "core" ? "success" : "outline"}>{t.coverage === "core" ? "Core set" : "Starter set"}</Badge>
                    </div>
                    <p className="font-semibold leading-snug group-hover:text-primary">{t.name}</p>
                    <p className="mt-auto text-xs text-muted-foreground">
                      {testsForTrack(t.slug).length} practice test{testsForTrack(t.slug).length === 1 ? "" : "s"} · {counts[t.slug]?.total ?? 0} questions
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section aria-labelledby="how-heading" className="mx-auto max-w-6xl space-y-8 px-4 py-16">
          <h2 id="how-heading" className="text-2xl font-semibold tracking-tight">How it works</h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {[
              { icon: BookOpen, title: "Choose an exam and skill", body: "Search every SAT Suite and AP course, then take a full practice test or narrow to a section, topic, or single skill." },
              { icon: Timer, title: "Test in a familiar format", body: "Practice tests run in timed modules with the tools you know from digital testing: mark for review, answer eliminator, reference sheet, and a break between sections." },
              { icon: BarChart3, title: "Follow the recommendations", body: "Mastery is tracked per skill from your real answers, and we suggest what to practice next." },
            ].map((s, i) => (
              <li key={s.title} className="rounded-2xl border bg-card p-6 shadow-card">
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <s.icon className="size-4" aria-hidden />
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">Step {i + 1}</span>
                </div>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Solo vs multiplayer */}
        <section aria-labelledby="modes-heading" className="border-y bg-card/50">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-16 md:grid-cols-2">
            <h2 id="modes-heading" className="sr-only">Solo and multiplayer modes</h2>
            <ModeCard
              icon={BookOpen}
              tone="primary"
              title="Solo study"
              body="Build skills at your own pace."
              points={["Quick Practice, Focus Mode, and Timed Challenges", "Daily Challenge shared by everyone", "Review incorrect, flagged, and saved questions", "Section-based exam simulation (practice only, not an official test)"]}
              href="/study"
              cta="Start studying"
            />
            <ModeCard
              icon={Swords}
              tone="violet"
              title="Play with friends"
              body="Turn review into a live quiz match."
              points={["Private rooms with a short code or invite link", "Everyone gets the same questions at the same time", "Server-checked answers and a visible scoring formula", "Leaderboard between rounds and a final podium"]}
              href="/play"
              cta="Create or join a room"
            />
          </div>
        </section>

        {/* Progress preview */}
        <section aria-labelledby="progress-heading" className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2">
          <div className="space-y-4">
            <h2 id="progress-heading" className="text-2xl font-semibold tracking-tight">Progress that means something</h2>
            <p className="text-muted-foreground">
              XP comes from correct answers and finished sessions, never from replaying the same questions. Streaks count calendar days in your own time zone, and skill mastery needs enough attempts before it rates you.
            </p>
            <ul className="space-y-2 text-sm">
              {["Levels with a published XP formula", "Daily and weekly study goals", "Skill mastery with a minimum sample size", "Achievements awarded from real activity"].map((p) => (
                <li key={p} className="flex items-center gap-2">
                  <Check className="size-4 text-success" aria-hidden /> {p}
                </li>
              ))}
            </ul>
          </div>
          <ProgressPreview />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function ModeCard({ icon: Icon, tone, title, body, points, href, cta }: { icon: typeof BookOpen; tone: "primary" | "violet"; title: string; body: string; points: string[]; href: string; cta: string }) {
  return (
    <div className="flex flex-col rounded-2xl border bg-card p-6 shadow-card">
      <span className={tone === "primary" ? "flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary" : "flex size-10 items-center justify-center rounded-xl bg-violet-soft text-violet"}>
        <Icon className="size-5" aria-hidden />
      </span>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{body}</p>
      <ul className="my-5 space-y-2 text-sm">
        {points.map((p) => (
          <li key={p} className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {p}
          </li>
        ))}
      </ul>
      <Button asChild variant={tone === "primary" ? "default" : "violet"} className="mt-auto self-start">
        <Link href={href}>{cta}</Link>
      </Button>
    </div>
  );
}

/** Static, clearly illustrative preview of the exam interface. */
function ExamPreview() {
  return (
    <figure className="relative" aria-label="Illustration of the practice interface">
      <div className="rounded-2xl border bg-card shadow-card">
        <div className="flex items-center justify-between border-b px-4 py-3 text-xs">
          <span className="font-medium">SAT Math · Linear equations</span>
          <span className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 font-mono">
            <Timer className="size-3" aria-hidden /> 11:42
          </span>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-sm text-muted-foreground">Question 3 of 10</p>
          <p className="font-medium">If 3x + 7 = 25, what is the value of 6x − 4?</p>
          <div className="grid gap-2">
            {["14", "26", "32", "36"].map((c, i) => (
              <div key={c} className={i === 2 ? "flex items-center gap-3 rounded-xl border-2 border-primary bg-primary-soft px-3 py-2.5 text-sm" : "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm"}>
                <span className={i === 2 ? "flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground" : "flex size-6 items-center justify-center rounded-full border text-xs font-semibold"}>
                  {"ABCD"[i]}
                </span>
                <span className={i === 1 ? "text-muted-foreground line-through" : undefined}>{c}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Flag className="size-3.5 text-warning" aria-hidden /> Marked for review
            </span>
            <span className="flex gap-1" aria-hidden>
              {Array.from({ length: 10 }, (_, i) => (
                <span key={i} className={i < 2 ? "size-2 rounded-full bg-primary" : i === 2 ? "size-2 rounded-full bg-foreground" : "size-2 rounded-full bg-muted"} />
              ))}
            </span>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-8 -left-2 w-60 rounded-2xl border bg-card p-4 shadow-xl sm:-left-8">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
          <Trophy className="size-3.5 text-warning" aria-hidden /> Round 3 standings
        </p>
        <ol className="space-y-1.5 text-xs">
          {[
            ["Player A", 438],
            ["Player B", 402],
            ["You", 371],
          ].map(([n, s], i) => (
            <li key={n} className="flex items-center justify-between">
              <span>
                {i + 1}. {n}
              </span>
              <span className="font-mono text-muted-foreground">{s}</span>
            </li>
          ))}
        </ol>
      </div>
      <figcaption className="mt-20 text-right text-xs text-muted-foreground sm:mt-6">Illustrative preview. Names and scores are examples.</figcaption>
    </figure>
  );
}

function ProgressPreview() {
  const bars = [0.3, 0.55, 0.2, 0.8, 0.65, 0.4, 0.9];
  return (
    <figure className="rounded-2xl border bg-card p-6 shadow-card" aria-label="Illustration of progress tracking">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-warning-soft text-warning">
            <Flame className="size-4" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold">Day streak</p>
            <p className="text-xs text-muted-foreground">Example data</p>
          </div>
        </div>
        <Badge variant="violet">
          <Zap /> Level 4
        </Badge>
      </div>
      <div className="mt-6 flex h-28 items-end gap-2" aria-hidden>
        {bars.map((b, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <div className="w-full rounded-md bg-primary/80" style={{ height: `${b * 100}%` }} />
            <span className="text-[10px] text-muted-foreground">{"MTWTFSS"[i]}</span>
          </div>
        ))}
      </div>
      <div className="mt-5 space-y-2">
        <div className="flex justify-between text-xs">
          <span>Weekly goal</span>
          <span className="text-muted-foreground">72 / 100 min</span>
        </div>
        <div className="h-2 rounded-full bg-muted">
          <div className="h-2 w-[72%] rounded-full bg-success" />
        </div>
      </div>
      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Users className="size-3.5" aria-hidden /> Illustrative only. Your dashboard uses your own activity.
      </p>
    </figure>
  );
}
