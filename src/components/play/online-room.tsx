"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { Check, Copy, Crown, DoorOpen, Link2, Loader2, LogOut, Play, Settings2, UserRound, Users, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog, Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, Notice } from "@/components/ui/states";
import { getTrack } from "@/lib/content/catalog";
import type { AnswerResponse } from "@/lib/content/types";
import { api, AppError } from "@/lib/data/repository";
import { ANSWER_GRACE_MS, displayNameSchema, normalizeRoomCode, scoringDescription, type RoomSettings } from "@/lib/multiplayer/rules";
import type { RoomPreview, RoomState } from "@/lib/server/rooms";
import { cn } from "@/lib/utils";
import { MatchStage, useServerNow } from "./match-stage";
import { RoomSettingsForm } from "./room-settings-form";

const PENDING_NAME_KEY = "studyduel:pending-display-name";

function pendingName(): string | null {
  try {
    return window.sessionStorage.getItem(PENDING_NAME_KEY);
  } catch {
    return null;
  }
}

type Loaded = { kind: "state"; state: RoomState } | { kind: "preview"; preview: RoomPreview };

export function OnlineRoom({ rawCode }: { rawCode: string }) {
  const { config, authReady, user, supabase } = useApp();
  const code = normalizeRoomCode(rawCode);
  const [data, setData] = React.useState<Loaded | null>(null);
  const [error, setError] = React.useState<AppError | null>(null);
  const [offset, setOffset] = React.useState(0);
  const [live, setLive] = React.useState(false);
  const [presence, setPresence] = React.useState<Set<string>>(new Set());
  const inFlight = React.useRef(false);

  const refresh = React.useCallback(async () => {
    if (!code || inFlight.current) return;
    inFlight.current = true;
    const sentAt = Date.now();
    try {
      const res = await api<{ state?: RoomState; preview?: RoomPreview }>(`/api/rooms/${code}`);
      const rtt = Date.now() - sentAt;
      if (res.state) {
        setOffset(res.state.serverNow + rtt / 2 - Date.now());
        setData({ kind: "state", state: res.state });
      } else if (res.preview) setData({ kind: "preview", preview: res.preview });
      setError(null);
    } catch (err) {
      setError(err instanceof AppError ? err : new AppError("Couldn't load this room."));
    } finally {
      inFlight.current = false;
    }
  }, [code]);

  React.useEffect(() => {
    if (authReady && user) void refresh();
  }, [authReady, user, refresh]);

  const isMember = data?.kind === "state";
  const userId = user?.id ?? null;
  // Realtime: private channel restricted by RLS to room members. Carries "something changed" pings and presence.
  React.useEffect(() => {
    if (!supabase || !code || !isMember || !userId) return;
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;
      channel = supabase.channel(`room:${code}`, { config: { private: true, presence: { key: userId, enabled: true } } });
      channel
        .on("broadcast", { event: "state" }, () => void refresh())
        .on("presence", { event: "sync" }, () => {
          setPresence(new Set(Object.keys(channel?.presenceState() ?? {})));
        })
        .subscribe(async (status) => {
          setLive(status === "SUBSCRIBED");
          if (status === "SUBSCRIBED") await channel?.track({ at: Date.now() });
        });
    })();
    return () => {
      cancelled = true;
      setLive(false);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [supabase, code, isMember, userId, refresh]);

  // Polling fallback (slower when realtime is connected) keeps state and presence fresh.
  React.useEffect(() => {
    if (!isMember) return;
    const t = window.setInterval(() => void refresh(), live ? 5000 : 2000);
    return () => window.clearInterval(t);
  }, [isMember, live, refresh]);

  if (config.mode !== "connected") {
    return (
      <ErrorState
        title="Online rooms need a connected backend"
        message="This deployment is running in demo mode, so rooms can't be shared between devices. Try a local practice match instead."
        className="mx-auto max-w-lg"
      />
    );
  }
  if (!code) return <RoomError title="That isn't a valid room code" message="Room codes are 6 letters or numbers, like K7Q2MZ." />;
  if (!authReady) return <Skeleton className="h-80" />;
  if (!user) return <GuestGate code={code} />;
  if (error) {
    if (["room_not_found", "room_expired", "invalid_code"].includes(error.code)) return <RoomError title={error.code === "room_expired" ? "This room has expired" : "Room not found"} message={error.message} />;
    return <ErrorState message={error.message} onRetry={refresh} className="mx-auto max-w-lg" />;
  }
  if (!data) return <Skeleton className="h-80" />;
  if (data.kind === "preview") return <JoinRoom preview={data.preview} onJoined={refresh} />;
  return <RoomView state={data.state} offset={offset} live={live} presence={presence} refresh={refresh} />;
}

function RoomError({ title, message }: { title: string; message: string }) {
  return (
    <div className="mx-auto max-w-lg space-y-4 text-center">
      <ErrorState title={title} message={message} />
      <Button asChild variant="outline">
        <Link href="/play">Back to Play</Link>
      </Button>
    </div>
  );
}

function GuestGate({ code }: { code: string }) {
  const { continueAsGuest, activity } = useApp();
  const [name, setName] = React.useState(activity?.preferences.displayName ?? "");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = displayNameSchema.safeParse(name);
    if (!parsed.success) return setErr(parsed.error.issues[0]?.message ?? "Choose a display name.");
    setBusy(true);
    try {
      try {
        window.sessionStorage.setItem(PENDING_NAME_KEY, parsed.data);
      } catch {
        /* storage blocked: the join form falls back to the profile name */
      }
      await continueAsGuest(parsed.data);
    } catch (error) {
      setErr(error instanceof AppError ? error.message : "Couldn't continue as a guest.");
      setBusy(false);
    }
  };
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Join room {code}</CardTitle>
        <CardDescription>Pick a display name to play as a guest, or sign in to earn XP on your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={go} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="guest-name">Display name</Label>
            <Input id="guest-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} aria-invalid={Boolean(err)} />
            {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <UserRound />} Continue as guest
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href={`/auth/sign-in?next=/play/${code}`}>Sign in instead</Link>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function JoinRoom({ preview, onJoined }: { preview: RoomPreview; onJoined: () => Promise<void> }) {
  const { activity } = useApp();
  const [name, setName] = React.useState(() => pendingName() ?? activity?.preferences.displayName ?? "");
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!dirty && !pendingName() && activity) setName(activity.preferences.displayName);
  }, [activity, dirty]);
  const full = preview.players >= preview.maxPlayers;
  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = displayNameSchema.safeParse(name);
    if (!parsed.success) return setErr(parsed.error.issues[0]?.message ?? "Choose a display name.");
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/rooms/${preview.code}/join`, { method: "POST", json: { displayName: parsed.data } });
      await onJoined();
    } catch (error) {
      setErr(error instanceof AppError ? error.message : "Couldn't join the room.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Join {preview.hostName}&apos;s room</CardTitle>
        <CardDescription>
          {preview.trackName} · {preview.players}/{preview.maxPlayers} players · code <span className="font-mono">{preview.code}</span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {preview.status === "playing" ? (
          <Notice tone="warning">A match is in progress. You can join once it finishes. This page will not update automatically; refresh in a minute.</Notice>
        ) : full ? (
          <Notice tone="warning">This room is full.</Notice>
        ) : (
          <form onSubmit={join} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="join-name">Display name</Label>
              <Input
                id="join-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setDirty(true);
                }}
                maxLength={24}
              />
            </div>
            {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
            <Button type="submit" className="w-full" variant="violet" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <DoorOpen />} Join room
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function RoomView({ state, offset, live, presence, refresh }: { state: RoomState; offset: number; live: boolean; presence: Set<string>; refresh: () => Promise<void> }) {
  const router = useRouter();
  const now = useServerNow(offset);
  const [submitting, setSubmitting] = React.useState(false);
  const [answerError, setAnswerError] = React.useState<string | null>(null);
  const advancedKey = React.useRef<string>("");
  const match = state.match;

  // When the current phase's deadline passes, ask the server to advance (it re-checks the clock itself).
  React.useEffect(() => {
    if (!match || match.phase === "finished") return;
    const due = match.phaseEndsAt + (match.phase === "question" ? ANSWER_GRACE_MS + 150 : 150);
    const key = `${match.id}:${match.phase}:${match.index}`;
    if (now >= due && advancedKey.current !== key) {
      advancedKey.current = key;
      api(`/api/rooms/${state.room.code}/advance`, { method: "POST" })
        .catch(() => undefined)
        .finally(() => void refresh());
    }
  }, [now, match, state.room.code, refresh]);

  React.useEffect(() => setAnswerError(null), [match?.index, match?.phase]);

  // Pull the new XP/achievements into the header once the server has finalized the match.
  const { refreshActivity } = useApp();
  const finalizedKey = match?.phase === "finished" && match.standings.some((s) => s.xpAwarded !== undefined) ? match.id : null;
  React.useEffect(() => {
    if (finalizedKey) void refreshActivity();
  }, [finalizedKey, refreshActivity]);

  const answer = async (response: AnswerResponse) => {
    if (!match) return;
    setSubmitting(true);
    setAnswerError(null);
    try {
      await api(`/api/rooms/${state.room.code}/answer`, { method: "POST", json: { matchId: match.id, index: match.index, response } });
      await refresh();
    } catch (err) {
      setAnswerError(err instanceof AppError ? err.message : "Your answer didn't go through.");
      await refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const playing = state.room.status === "playing" && match;
  const finished = state.room.status === "finished" && match?.phase === "finished";

  return (
    <div className="space-y-6">
      <RoomHeader state={state} live={live} />
      {playing && !finished ? (
        <MatchStage match={match} now={now} onAnswer={answer} submitting={submitting} answerError={answerError} />
      ) : (
        <>
          {finished && match && (
            <MatchStage
              match={match}
              now={now}
              onAnswer={answer}
              submitting={false}
              answerError={null}
              footer={
                <Notice tone="info">
                  {state.me.isHost ? "Start another round from the lobby below when everyone is ready." : "Mark yourself ready below to play another round."}{" "}
                  <Link href="/dashboard" className="font-medium text-primary underline-offset-4 hover:underline">
                    Return to dashboard
                  </Link>
                </Notice>
              }
            />
          )}
          <Lobby state={state} presence={presence} refresh={refresh} onLeft={() => router.push("/play")} />
        </>
      )}
    </div>
  );
}

function RoomHeader({ state, live }: { state: RoomState; live: boolean }) {
  const [copied, setCopied] = React.useState<"code" | "link" | null>(null);
  const copy = async (what: "code" | "link") => {
    const text = what === "code" ? state.room.code : `${window.location.origin}/play/${state.room.code}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      toast.success(what === "code" ? "Room code copied" : "Invite link copied");
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Couldn't access the clipboard. Select and copy the code instead.");
    }
  };
  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-card sm:flex-row sm:items-center">
      <div className="flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Room code</p>
        <p className="select-all font-mono text-3xl font-semibold tracking-[0.25em]">{state.room.code}</p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          {live ? <Wifi className="size-3.5 text-success" aria-hidden /> : <WifiOff className="size-3.5" aria-hidden />}
          {live ? "Live updates connected" : "Live updates reconnecting; refreshing every 2 seconds"}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => copy("code")}>
          {copied === "code" ? <Check /> : <Copy />} Copy code
        </Button>
        <Button variant="outline" onClick={() => copy("link")}>
          {copied === "link" ? <Check /> : <Link2 />} Copy invite link
        </Button>
      </div>
    </div>
  );
}

function Lobby({ state, presence, refresh, onLeft }: { state: RoomState; presence: Set<string>; refresh: () => Promise<void>; onLeft: () => void }) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<RoomSettings>(state.room.settings);
  const me = state.members.find((m) => m.isMe);
  const settings = state.room.settings;
  const online = (m: RoomState["members"][number]) => m.online || presence.has(m.userId);
  const onlineCount = state.members.filter(online).length;
  const notReady = state.members.filter((m) => m.role !== "host" && !m.isReady && online(m));
  const canStart = state.me.isHost && onlineCount >= settings.minPlayers && notReady.length === 0;

  const act = async (key: string, path: string, json?: unknown, method = "POST") => {
    setBusy(key);
    try {
      await api(`/api/rooms/${state.room.code}/${path}`, { method, json });
      await refresh();
      return true;
    } catch (err) {
      toast.error(err instanceof AppError ? err.message : "That didn't work. Please try again.");
      return false;
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-5" aria-hidden /> Players ({state.members.length}/{settings.maxPlayers})
            </CardTitle>
            <CardDescription>
              {onlineCount} online · needs at least {settings.minPlayers} to start
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="divide-y" aria-live="polite">
            {state.members.map((m) => (
              <li key={m.userId} className="flex items-center gap-3 py-3">
                <span className={cn("size-2.5 shrink-0 rounded-full", online(m) ? "bg-success" : "bg-muted-foreground/40")} aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {m.displayName}
                  {m.isMe && <span className="font-normal text-muted-foreground"> (you)</span>}
                  <span className="sr-only">{online(m) ? ", online" : ", offline"}</span>
                </span>
                {m.role === "host" && (
                  <Badge variant="warning">
                    <Crown /> Host
                  </Badge>
                )}
                {m.role !== "host" && (m.isReady ? <Badge variant="success"><Check /> Ready</Badge> : <Badge variant="outline">Not ready</Badge>)}
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            {state.me.isHost ? (
              <Button size="lg" onClick={() => act("start", "start")} disabled={!canStart || busy !== null}>
                {busy === "start" ? <Loader2 className="animate-spin" /> : <Play />} Start match
              </Button>
            ) : (
              me && (
                <Button size="lg" variant={me.isReady ? "outline" : "success"} onClick={() => act("ready", "ready", { ready: !me.isReady })} disabled={busy !== null}>
                  {busy === "ready" ? <Loader2 className="animate-spin" /> : <Check />} {me.isReady ? "Not ready" : "I'm ready"}
                </Button>
              )
            )}
            <Button variant="ghost" onClick={() => setLeaveOpen(true)}>
              <LogOut /> Leave room
            </Button>
          </div>
          {state.me.isHost && !canStart && (
            <p className="mt-3 text-sm text-muted-foreground" role="status">
              {onlineCount < settings.minPlayers
                ? `Waiting for at least ${settings.minPlayers} players. Share the code or invite link.`
                : `Waiting for ${notReady.map((m) => m.displayName).join(", ")} to get ready.`}
            </p>
          )}
          {!state.me.isHost && <p className="mt-3 text-sm text-muted-foreground">The host starts the match when everyone is ready.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>Match settings</CardTitle>
            <CardDescription>{getTrack(settings.track)?.name ?? settings.track}</CardDescription>
          </div>
          {state.me.isHost && (
            <Button variant="ghost" size="icon-sm" onClick={() => { setDraft(settings); setSettingsOpen(true); }} aria-label="Edit match settings">
              <Settings2 />
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <dl className="grid grid-cols-2 gap-2">
            <Info label="Questions" value={String(settings.questionCount)} />
            <Info label="Time each" value={`${settings.secondsPerQuestion}s`} />
            <Info label="Difficulty" value={settings.difficulty} />
            <Info label="Topic" value={settings.sections?.[0] ?? "All sections"} />
          </dl>
          <div className="rounded-xl bg-muted/60 p-3">
            <p className="mb-1 font-medium">Scoring</p>
            <p className="text-muted-foreground">{scoringDescription(settings.scoring)}</p>
          </div>
          <p className="text-xs text-muted-foreground">Room expires after 6 hours of inactivity.</p>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title="Leave this room?"
        description={state.me.isHost ? "You're the host. Hosting passes to another player, or the room closes if you're the last one." : "You can rejoin with the code while the room is open."}
        confirmLabel="Leave room"
        destructive
        onConfirm={async () => {
          if (await act("leave", "leave")) onLeft();
        }}
      />
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Match settings</DialogTitle>
          </DialogHeader>
          <RoomSettingsForm value={draft} onChange={setDraft} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                if (await act("settings", "settings", { settings: draft }, "PUT")) {
                  setSettingsOpen(false);
                  toast.success("Settings updated. Players need to ready up again.");
                }
              }}
              disabled={busy !== null}
            >
              Save settings
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/60 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium capitalize">{value}</dd>
    </div>
  );
}
