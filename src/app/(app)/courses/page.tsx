"use client";

import { ClipboardList, ExternalLink, Search, SearchX } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import { TrackIcon } from "@/components/study/track-icon";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/states";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { poolForTrack } from "@/lib/content/bank";
import { DIRECTORY, searchCourses, SUBJECT_AREAS, type SubjectArea } from "@/lib/content/course-directory";
import { testsForTrack } from "@/lib/content/tests";
import { cn } from "@/lib/utils";

export default function CoursesPage() {
  return (
    <React.Suspense fallback={null}>
      <CourseSearch />
    </React.Suspense>
  );
}

function CourseSearch() {
  const params = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = React.useState(params.get("q") ?? "");
  const [subject, setSubject] = React.useState<SubjectArea | "all">(() => {
    const raw = params.get("subject");
    return SUBJECT_AREAS.find((s) => s === raw) ?? "all";
  });
  const [program, setProgram] = React.useState<"all" | "SAT Suite" | "AP">("all");
  const [onlyPractice, setOnlyPractice] = React.useState(params.get("practice") === "1");

  // Keep the URL shareable without adding history entries on every keystroke.
  React.useEffect(() => {
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    if (subject !== "all") sp.set("subject", subject);
    if (onlyPractice) sp.set("practice", "1");
    const qs = sp.toString();
    router.replace(qs ? `/courses?${qs}` : "/courses", { scroll: false });
  }, [query, subject, onlyPractice, router]);

  const results = searchCourses(query).filter(
    (c) => (subject === "all" || c.subject === subject) && (program === "all" || c.program === program) && (!onlyPractice || c.track),
  );
  const withPractice = DIRECTORY.filter((c) => c.track).length;

  return (
    <>
      <PageHeader
        title="Find your course"
        description={`Search all ${DIRECTORY.length} SAT Suite and AP courses. ${withPractice} have StudyDuel practice tests and skill practice; every course links to College Board's own free practice materials.`}
      />
      <div className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by course, nickname, or subject: APUSH, calc, chem, PSAT…"
            aria-label="Search courses"
            className="h-14 rounded-2xl pl-12 text-base"
            autoFocus
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            label="Program"
            value={program}
            onValueChange={setProgram}
            options={[
              { value: "all", label: "All" },
              { value: "SAT Suite", label: "SAT Suite" },
              { value: "AP", label: "AP" },
            ]}
          />
          <div className="flex items-center gap-2">
            <Switch id="only-practice" checked={onlyPractice} onCheckedChange={setOnlyPractice} />
            <Label htmlFor="only-practice">Has StudyDuel practice</Label>
          </div>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Subject area">
          {(["all", ...SUBJECT_AREAS] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={subject === s}
              onClick={() => setSubject(s)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                subject === s ? "border-primary bg-primary-soft text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s === "all" ? "All subjects" : s}
            </button>
          ))}
        </div>

        <p className="text-sm text-muted-foreground" aria-live="polite">
          {results.length} course{results.length === 1 ? "" : "s"}
        </p>
        {results.length === 0 ? (
          <EmptyState icon={SearchX} title="No courses match" description="Try a shorter search, a nickname like “APUSH” or “calc”, or clear the filters." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((c) => {
              const tests = c.track ? testsForTrack(c.track).length : 0;
              const questions = c.track ? poolForTrack(c.track).length : 0;
              return (
                <li key={c.slug}>
                  <Link href={`/courses/${c.slug}`} className="flex h-full flex-col gap-3 rounded-2xl border bg-card p-4 shadow-card transition-colors hover:border-primary/40">
                    <div className="flex items-start gap-3">
                      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", c.track ? "bg-primary-soft text-primary" : "bg-muted text-muted-foreground")}>
                        <TrackIcon slug={c.track ?? c.slug} className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold leading-snug">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.subject}</p>
                      </div>
                    </div>
                    <div className="mt-auto flex flex-wrap gap-1.5">
                      {c.track ? (
                        <>
                          <Badge variant="success">
                            <ClipboardList /> {tests} practice test{tests === 1 ? "" : "s"}
                          </Badge>
                          <Badge variant="outline">{questions} questions</Badge>
                        </>
                      ) : (
                        <Badge variant="outline">
                          <ExternalLink /> Official resources only
                        </Badge>
                      )}
                      {c.format === "portfolio" && <Badge variant="outline">Portfolio course</Badge>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
