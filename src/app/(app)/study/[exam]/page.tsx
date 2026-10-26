"use client";

import { ChevronRight, Info, Loader2, Play, SearchX, Trophy } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import { useApp } from "@/components/providers/app-provider";
import { TrackIcon } from "@/components/study/track-icon";
import { useStartSession } from "@/components/study/use-start-session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState, Notice } from "@/components/ui/states";
import { Switch } from "@/components/ui/switch";
import { outlineForTrack } from "@/lib/content/bank";
import { getTrack } from "@/lib/content/catalog";
import { filterPool, suggestedTimeLimit } from "@/lib/engine/selection";
import { MODE_LABELS, type SessionConfig } from "@/lib/engine/types";
import { BAND_LABEL } from "@/lib/progression/mastery";
import { computeProgress } from "@/lib/progression/stats";
import { XP_RULES } from "@/lib/progression/xp";
import { cn, formatDuration, pct } from "@/lib/utils";

type ConfigMode = "quick" | "focus" | "timed" | "simulation";
const CONFIG_MODES: ConfigMode[] = ["quick", "focus", "timed", "simulation"];

export default function ExamPage() {
  return (
    <React.Suspense fallback={null}>
      <ExamConfigurator />
    </React.Suspense>
  );
}

function ExamConfigurator() {
  const { exam } = useParams<{ exam: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const track = getTrack(exam);
  const { activity } = useApp();
  const { start, starting } = useStartSession();

  const initialMode = (CONFIG_MODES as string[]).includes(search.get("mode") ?? "") ? (search.get("mode") as ConfigMode) : "quick";
  const [mode, setModeState] = React.useState<ConfigMode>(initialMode);
  const [sections, setSections] = React.useState<string[]>([]);
  const [topics, setTopics] = React.useState<string[]>([]);
  const [skill, setSkill] = React.useState<string | null>(search.get("skill"));
  const [difficulty, setDifficulty] = React.useState<SessionConfig["difficulty"]>("mixed");
  const [count, setCount] = React.useState("10");
  const [timerOn, setTimerOn] = React.useState(false);
  const [minutes, setMinutes] = React.useState("10");
  const [feedback, setFeedback] = React.useState<SessionConfig["feedback"]>("immediate");
  const [hints, setHints] = React.useState(true);

  const setMode = (m: ConfigMode) => {
    setModeState(m);
    router.replace(`/study/${exam}?mode=${m}`, { scroll: false });
  };

  const outline = React.useMemo(() => (track ? outlineForTrack(track) : []), [track]);
  const progress = React.useMemo(() => (activity ? computeProgress(activity) : null), [activity]);

  if (!track) {
    return (
      <EmptyState
        icon={SearchX}
        title="Exam not found"
        description="We don't have that exam or course. Choose one from the study page."
        action={
          <Button asChild>
            <Link href="/study">Browse exams</Link>
          </Button>
        }
      />
    );
  }

  const base: SessionConfig = {
    mode,
    track: track.slug,
    sections: mode !== "focus" && sections.length ? sections : undefined,
    topics: mode !== "focus" && mode !== "simulation" && topics.length ? topics : undefined,
    skills: mode === "focus" && skill ? [skill] : undefined,
    difficulty: mode === "simulation" ? "mixed" : difficulty,
    count: 10,
    timeLimitSec: null,
    feedback: mode === "focus" ? "immediate" : mode === "quick" ? feedback : "end",
    hints: mode === "focus" ? true : mode === "quick" ? hints : false,
  };
  const pool = filterPool(base);
  const wanted = mode === "simulation" ? Math.min(pool.length, 40) : mode === "timed" ? 10 : Number(count);
  const effectiveCount = Math.min(wanted, pool.length);
  const estimate = suggestedTimeLimit(pool.slice(0, effectiveCount).map((q) => q.id));
  const timeLimitSec =
    mode === "timed" ? Math.max(60, Math.round((estimate * 0.85) / 30) * 30) : mode === "simulation" ? Number(minutes) * 60 : mode === "quick" && timerOn ? Number(minutes) * 60 : null;
  const config: SessionConfig = { ...base, count: Math.max(1, effectiveCount), timeLimitSec };
  const canStart = effectiveCount > 0 && !(mode === "focus" && !skill);

  const skillMastery = new Map((progress?.skills ?? []).map((s) => [s.skill, s]));
  const weakSkills = (progress?.weakest ?? []).filter((s) => outline.some((sec) => sec.topics.some((t) => t.skills.some((sk) => sk.skill === s.skill))));
  const best = activity?.results
    .filter((r) => r.config.mode === "timed" && r.config.track === track.slug)
    .reduce<number | null>((b, r) => Math.max(b ?? 0, r.challengeScore ?? 0), null);

  const toggle = (list: string[], set: (v: string[]) => void, value: string) => set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/study" className="hover:text-foreground">Study</Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span className="text-foreground">{track.name}</span>
      </nav>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2">
            <TrackIcon slug={track.slug} className="size-4" /> {track.program}
            <Badge variant={track.coverage === "core" ? "success" : "outline"}>{track.coverage === "core" ? "Core set" : "Starter set"}</Badge>
          </span>
        }
        title={track.name}
        description={track.description}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Mode</CardTitle>
              <CardDescription>
                {mode === "quick" && "A short mixed set. Choose topics, length, timer, and when to see feedback."}
                {mode === "focus" && "Pick one skill. You'll get hints and an explanation after every question."}
                {mode === "timed" && "Ten questions against the clock. Score = 100 per correct answer plus up to 20 per correct answer for unused time."}
                {mode === "simulation" && "Questions grouped by section, easier to harder, with a fixed time limit. Feedback comes at the end."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Segmented label="Study mode" value={mode} onValueChange={setMode} options={CONFIG_MODES.map((m) => ({ value: m, label: MODE_LABELS[m] }))} />
            </CardContent>
          </Card>

          {mode === "focus" ? (
            <Card>
              <CardHeader>
                <CardTitle>Choose a skill</CardTitle>
                <CardDescription>Mastery ratings appear after {3} attempts on a skill.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {weakSkills.length > 0 && (
                  <Notice tone="violet" icon={Info}>
                    Suggested from your results: {weakSkills.map((s) => s.skill).join(", ")}.
                  </Notice>
                )}
                {outline.map((section) => (
                  <fieldset key={section.section} className="space-y-3">
                    <legend className="mb-2 text-sm font-semibold">{section.section}</legend>
                    {section.topics.map((topic) => (
                      <div key={topic.topic}>
                        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{topic.topic}</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {topic.skills.map((s) => {
                            const m = skillMastery.get(s.skill);
                            return (
                              <button
                                key={s.skill}
                                type="button"
                                role="radio"
                                aria-checked={skill === s.skill}
                                onClick={() => setSkill(s.skill)}
                                className={cn(
                                  "flex items-center justify-between gap-2 rounded-xl border-2 px-3 py-2.5 text-left text-sm transition-colors",
                                  skill === s.skill ? "border-primary bg-primary-soft" : "border-border hover:border-primary/40",
                                )}
                              >
                                <span>
                                  <span className="font-medium">{s.skill}</span>
                                  <span className="block text-xs text-muted-foreground">
                                    {s.count} question{s.count === 1 ? "" : "s"}
                                    {m ? ` · ${BAND_LABEL[m.band]}${m.score !== null ? ` (${pct(m.score)})` : ""}` : ""}
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </fieldset>
                ))}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>{mode === "simulation" ? "Sections" : "Sections and topics"}</CardTitle>
                <CardDescription>Leave everything unchecked to include all of {track.shortName}.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {outline.map((section) => (
                  <fieldset key={section.section} className="space-y-2">
                    <div className="flex items-center gap-2.5">
                      <Checkbox
                        id={`sec-${section.section}`}
                        checked={sections.includes(section.section)}
                        onCheckedChange={() => toggle(sections, setSections, section.section)}
                      />
                      <Label htmlFor={`sec-${section.section}`} className="font-semibold">
                        {section.section}
                      </Label>
                      <span className="text-xs text-muted-foreground">{section.count}</span>
                    </div>
                    {mode !== "simulation" && (
                      <div className="ml-7 flex flex-wrap gap-2">
                        {section.topics.map((topic) => (
                          <button
                            key={topic.topic}
                            type="button"
                            aria-pressed={topics.includes(topic.topic)}
                            onClick={() => toggle(topics, setTopics, topic.topic)}
                            className={cn(
                              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                              topics.includes(topic.topic) ? "border-primary bg-primary-soft text-primary" : "text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {topic.topic} · {topic.count}
                          </button>
                        ))}
                      </div>
                    )}
                  </fieldset>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {mode !== "simulation" && (
                <Row label="Difficulty">
                  <Segmented
                    label="Difficulty"
                    value={difficulty}
                    onValueChange={setDifficulty}
                    options={(["mixed", ...(track.difficulties ?? ["easy", "medium", "hard"])] as SessionConfig["difficulty"][]).map((d) => ({ value: d, label: d[0]!.toUpperCase() + d.slice(1) }))}
                  />
                </Row>
              )}
              {(mode === "quick" || mode === "focus") && (
                <Row label="Questions">
                  <Segmented label="Number of questions" value={count} onValueChange={setCount} options={["5", "10", "20"].map((c) => ({ value: c, label: c }))} />
                </Row>
              )}
              {mode === "quick" && (
                <>
                  <Row label="Feedback">
                    <Segmented
                      label="Feedback timing"
                      value={feedback}
                      onValueChange={setFeedback}
                      options={[
                        { value: "immediate", label: "After each question" },
                        { value: "end", label: "At the end" },
                      ]}
                    />
                  </Row>
                  <Row label="Hints">
                    <Switch checked={hints} onCheckedChange={setHints} aria-label="Show hints" />
                  </Row>
                  <Row label="Timer">
                    <div className="flex flex-wrap items-center gap-3">
                      <Switch checked={timerOn} onCheckedChange={setTimerOn} aria-label="Use a timer" />
                      {timerOn && <Segmented label="Time limit in minutes" value={minutes} onValueChange={setMinutes} options={["5", "10", "15", "20", "30"].map((m) => ({ value: m, label: `${m} min` }))} />}
                    </div>
                  </Row>
                </>
              )}
              {mode === "simulation" && (
                <Row label="Time limit">
                  <Segmented label="Time limit in minutes" value={minutes} onValueChange={setMinutes} options={["15", "30", "45", "60", "90"].map((m) => ({ value: m, label: `${m} min` }))} />
                </Row>
              )}
              {mode === "timed" && <p className="text-sm text-muted-foreground">Time limit is set from the questions' estimated times (about 85% of the estimate).</p>}
            </CardContent>
          </Card>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Session summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Stat label="Mode" value={MODE_LABELS[mode]} />
                <Stat label="Questions" value={String(effectiveCount)} />
                <Stat label="Time" value={timeLimitSec ? formatDuration(timeLimitSec) : "Untimed"} />
                <Stat label="Feedback" value={config.feedback === "immediate" ? "Each question" : "At the end"} />
              </dl>
              {effectiveCount < wanted && effectiveCount > 0 && (
                <Notice tone="warning">Only {effectiveCount} questions match these filters, so the session will be shorter.</Notice>
              )}
              {effectiveCount === 0 && <Notice tone="warning">No questions match these filters. Try a broader selection.</Notice>}
              {mode === "timed" && best !== null && best !== undefined && (
                <p className="flex items-center gap-2 text-sm">
                  <Trophy className="size-4 text-warning" aria-hidden /> Personal best: <strong>{best}</strong>
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                XP: {XP_RULES.correct.easy}/{XP_RULES.correct.medium}/{XP_RULES.correct.hard} per correct easy/medium/hard answer (first time in {XP_RULES.freshWindowDays} days) plus {XP_RULES.sessionComplete} for finishing.
              </p>
              <Button className="w-full" size="lg" disabled={!canStart || starting} onClick={() => start(config)}>
                {starting ? <Loader2 className="animate-spin" /> : <Play />}
                {mode === "focus" && !skill ? "Choose a skill" : "Start session"}
              </Button>
              <p className="text-xs leading-relaxed text-muted-foreground">{track.formatNote}</p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
      <span className="w-24 shrink-0 text-sm font-medium">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/60 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
