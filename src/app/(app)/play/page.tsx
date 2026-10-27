"use client";

import { Bot, DoorOpen, Loader2, Plus, Swords, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { RoomSettingsForm } from "@/components/play/room-settings-form";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/states";
import { api, AppError } from "@/lib/data/repository";
import { DEFAULT_ROOM_SETTINGS, displayNameSchema, normalizeRoomCode, ROOM_CODE_LENGTH, type RoomSettings } from "@/lib/multiplayer/rules";

export default function PlayPage() {
  const { config, user, activity, continueAsGuest } = useApp();
  const router = useRouter();
  const [settings, setSettings] = React.useState<RoomSettings>(DEFAULT_ROOM_SETTINGS);
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [codeError, setCodeError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (activity && !name) setName(activity.preferences.displayName);
    if (activity?.preferences.tracks[0]) setSettings((s) => (s.track === DEFAULT_ROOM_SETTINGS.track ? { ...s, track: activity.preferences.tracks[0]! } : s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity]);

  const create = async () => {
    const parsed = displayNameSchema.safeParse(name);
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message ?? "Choose a display name.");
    setCreating(true);
    try {
      if (!user) await continueAsGuest(parsed.data);
      const { code: roomCode } = await api<{ code: string }>("/api/rooms", { method: "POST", json: { settings, displayName: parsed.data } });
      router.push(`/play/${roomCode}`);
    } catch (err) {
      toast.error(err instanceof AppError ? err.message : "Couldn't create the room.");
      setCreating(false);
    }
  };

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeRoomCode(code);
    if (!normalized) return setCodeError(`Room codes are ${ROOM_CODE_LENGTH} letters or numbers, like K7Q2MZ.`);
    router.push(`/play/${normalized}`);
  };

  const connected = config.mode === "connected";
  return (
    <>
      <PageHeader title="Play with friends" description="Private quiz matches: everyone gets the same questions at the same time, and the server checks every answer." />

      {!connected && (
        <Notice tone="warning" icon={WifiOff} className="mb-6">
          <span className="font-medium">Online multiplayer isn&apos;t available in demo mode.</span> It needs the database setup described in the README. You can still try a local practice match below; the other players are clearly labeled bots, not real people.
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className={connected ? undefined : "opacity-60"} aria-disabled={!connected}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="size-5 text-primary" aria-hidden /> Create a private room
            </CardTitle>
            <CardDescription>You&apos;ll get a code and invite link to share. Only people who join can see the room.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <fieldset disabled={!connected} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="host-name">Your display name</Label>
                <Input id="host-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} className="max-w-xs" />
              </div>
              <RoomSettingsForm value={settings} onChange={setSettings} />
              <Button size="lg" onClick={create} disabled={!connected || creating}>
                {creating ? <Loader2 className="animate-spin" /> : <Swords />} Create room
              </Button>
              {connected && !user && <p className="text-xs text-muted-foreground">You&apos;ll play as a guest. <Link href="/auth/sign-in?next=/play" className="text-primary underline">Sign in</Link> to earn XP on your account and add friends.</p>}
            </fieldset>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className={connected ? undefined : "opacity-60"}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DoorOpen className="size-5 text-violet" aria-hidden /> Join with a code
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={join} className="space-y-3" noValidate>
                <Label htmlFor="room-code">Room code</Label>
                <Input
                  id="room-code"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    setCodeError(null);
                  }}
                  disabled={!connected}
                  placeholder="K7Q2MZ"
                  autoCapitalize="characters"
                  autoComplete="off"
                  maxLength={8}
                  aria-invalid={Boolean(codeError)}
                  aria-describedby="code-help"
                  className="h-14 text-center font-mono text-2xl tracking-[0.3em] uppercase"
                />
                <p id="code-help" className={codeError ? "text-sm text-destructive" : "text-xs text-muted-foreground"} role={codeError ? "alert" : undefined}>
                  {codeError ?? "Ask your host for the 6-character code, or open their invite link."}
                </p>
                <Button type="submit" variant="violet" className="w-full" disabled={!connected || !code}>
                  Join room
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="size-5 text-muted-foreground" aria-hidden /> Local practice match
              </CardTitle>
              <CardDescription>
                Try the match format on this device against simulated practice bots. Bots are labeled and never count as real opponents: no victory bonus or multiplayer achievements.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link href="/play/local">Start a local demo match</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
