"use client";

import * as React from "react";
import { NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { outlineForTrack, poolForTrack } from "@/lib/content/bank";
import { TRACKS } from "@/lib/content/catalog";
import { scoringDescription, type RoomSettings } from "@/lib/multiplayer/rules";

export function RoomSettingsForm({ value, onChange, showPlayers = true }: { value: RoomSettings; onChange: (s: RoomSettings) => void; showPlayers?: boolean }) {
  const set = <K extends keyof RoomSettings>(k: K, v: RoomSettings[K]) => onChange({ ...value, [k]: v });
  const sections = outlineForTrack(value.track).map((s) => s.section);
  const available = poolForTrack(value.track).filter(
    (q) => (!value.sections?.length || value.sections.includes(q.section)) && (value.difficulty === "mixed" || q.difficulty === value.difficulty),
  ).length;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="room-track">Exam or course</Label>
          <NativeSelect id="room-track" value={value.track} onChange={(e) => onChange({ ...value, track: e.target.value, sections: undefined, topics: undefined })}>
            {TRACKS.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="room-section">Topic area</Label>
          <NativeSelect id="room-section" value={value.sections?.[0] ?? ""} onChange={(e) => set("sections", e.target.value ? [e.target.value] : undefined)}>
            <option value="">All sections</option>
            {sections.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <Field label="Questions">
        <Segmented label="Number of questions" value={String(value.questionCount)} onValueChange={(v) => set("questionCount", Number(v))} options={["5", "8", "10", "15"].map((n) => ({ value: n, label: n }))} />
      </Field>
      <Field label="Difficulty">
        <Segmented
          label="Difficulty"
          value={value.difficulty}
          onValueChange={(v) => set("difficulty", v)}
          options={(["mixed", "easy", "medium", "hard"] as const).map((d) => ({ value: d, label: d[0]!.toUpperCase() + d.slice(1) }))}
        />
      </Field>
      <Field label="Time per question">
        <Segmented label="Seconds per question" value={String(value.secondsPerQuestion)} onValueChange={(v) => set("secondsPerQuestion", Number(v))} options={["15", "30", "45", "60", "90"].map((n) => ({ value: n, label: `${n}s` }))} />
      </Field>
      <Field label="Scoring">
        <Segmented
          label="Scoring rule"
          value={value.scoring}
          onValueChange={(v) => set("scoring", v)}
          options={[
            { value: "speed", label: "Correct + speed bonus" },
            { value: "accuracy", label: "Accuracy only" },
          ]}
        />
        <p className="mt-2 text-xs text-muted-foreground">{scoringDescription(value.scoring)}</p>
      </Field>
      {showPlayers && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="min-players">Minimum players</Label>
            <NativeSelect id="min-players" value={value.minPlayers} onChange={(e) => onChange({ ...value, minPlayers: Number(e.target.value), maxPlayers: Math.max(value.maxPlayers, Number(e.target.value)) })}>
              {[1, 2, 3, 4, 6, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="max-players">Maximum players</Label>
            <NativeSelect id="max-players" value={value.maxPlayers} onChange={(e) => onChange({ ...value, maxPlayers: Number(e.target.value), minPlayers: Math.min(value.minPlayers, Number(e.target.value)) })}>
              {[2, 4, 6, 8, 12, 20].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {available >= value.questionCount
          ? `${available} questions match these settings.`
          : `Only ${available} questions match, so the match will have ${available} question${available === 1 ? "" : "s"}.`}
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      {children}
    </div>
  );
}
