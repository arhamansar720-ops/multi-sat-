"use client";

import { Check, Flame, Loader2, Swords, UserMinus, UserPlus, Users, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { RequiresAccount } from "@/components/layout/requires-account";
import { useApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api, AppError } from "@/lib/data/repository";
import { computeStreak, localDateKey } from "@/lib/progression/dates";
import { levelInfo } from "@/lib/progression/xp";
import { relativeTime } from "@/lib/utils";

interface FriendRow {
  friend_id: string;
  display_name: string;
  username: string | null;
  total_xp: number;
  shares_activity: boolean;
  weekly_xp: number | null;
  last_active: string | null;
  recent_days: string[] | null;
}
interface RequestRow {
  id: string;
  direction: "incoming" | "outgoing";
  other_id: string;
  display_name: string;
  username: string | null;
  created_at: string;
}

const SEND_MESSAGES: Record<string, string> = {
  sent: "Friend request sent.",
  accepted: "You're now friends! They had already sent you a request.",
  not_found: "No registered student has that username.",
  self: "That's your own username.",
  already_friends: "You're already friends.",
  rate_limited: "You have too many pending requests. Wait for some to be answered.",
};

export default function FriendsPage() {
  return (
    <>
      <PageHeader title="Friends" description="Add friends by username, compare progress privately, and invite them to rooms." />
      <RequiresAccount feature="Friends">
        <FriendsView />
      </RequiresAccount>
    </>
  );
}

function FriendsView() {
  const { activity } = useApp();
  const [friends, setFriends] = React.useState<FriendRow[] | null>(null);
  const [requests, setRequests] = React.useState<RequestRow[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [username, setUsername] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [removing, setRemoving] = React.useState<FriendRow | null>(null);

  const load = React.useCallback(async () => {
    try {
      const data = await api<{ friends: FriendRow[]; requests: RequestRow[] }>("/api/friends");
      setError(null);
      setFriends(data.friends);
      setRequests(data.requests);
    } catch (err) {
      setError(err instanceof AppError && err.code === "registered_only" ? err.message : "Couldn't load your friends. Please try again.");
    }
  }, []);
  React.useEffect(() => void load(), [load]);

  const act = async (key: string, action: Record<string, unknown>) => {
    setBusy(key);
    try {
      const { result } = await api<{ result: string }>("/api/friends", { method: "POST", json: action });
      await load();
      return result;
    } catch (err) {
      toast.error(err instanceof AppError ? err.message : "That didn't work.");
      return null;
    } finally {
      setBusy(null);
    }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = username.trim().replace(/^@/, "");
    if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) return toast.error("Usernames are 3-20 letters, numbers, or underscores.");
    const result = await act("send", { action: "send", username: name });
    if (result) {
      (result === "sent" || result === "accepted" ? toast.success : toast.error)(SEND_MESSAGES[result] ?? result);
      if (result === "sent" || result === "accepted") setUsername("");
    }
  };

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!friends) return <Skeleton className="h-64" />;
  const incoming = requests.filter((r) => r.direction === "incoming");
  const outgoing = requests.filter((r) => r.direction === "outgoing");
  const today = localDateKey(new Date(), activity?.preferences.timezone ?? "UTC");

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        {incoming.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Friend requests</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {incoming.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{r.display_name}</p>
                      <p className="text-xs text-muted-foreground">@{r.username} · {relativeTime(r.created_at)}</p>
                    </div>
                    <Button size="sm" variant="success" onClick={() => act(`acc-${r.id}`, { action: "respond", requestId: r.id, accept: true }).then((x) => x && toast.success("Friend added"))} disabled={busy !== null}>
                      {busy === `acc-${r.id}` ? <Loader2 className="animate-spin" /> : <Check />} Accept
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => act(`dec-${r.id}`, { action: "respond", requestId: r.id, accept: false })} disabled={busy !== null}>
                      <X /> Decline
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Your friends ({friends.length})</CardTitle>
            <CardDescription>Activity is shown only for friends who share it.</CardDescription>
          </CardHeader>
          <CardContent>
            {friends.length === 0 ? (
              <EmptyState icon={Users} title="No friends yet" description="Send a request using their username. They can find their username on the Profile page." />
            ) : (
              <ul className="divide-y">
                {friends.map((f) => {
                  const streak = f.recent_days ? computeStreak(f.recent_days, today).current : null;
                  return (
                    <li key={f.friend_id} className="flex flex-wrap items-center gap-3 py-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-violet-soft text-sm font-semibold text-violet">{f.display_name.slice(0, 2).toUpperCase()}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{f.display_name}</p>
                        <p className="text-xs text-muted-foreground">
                          @{f.username} · Level {levelInfo(f.total_xp).level}
                          {f.shares_activity ? ` · ${f.weekly_xp ?? 0} XP this week${f.last_active ? ` · last active ${f.last_active}` : ""}` : " · activity private"}
                        </p>
                      </div>
                      {streak !== null && streak > 0 && (
                        <Badge variant="warning">
                          <Flame /> {streak}d
                        </Badge>
                      )}
                      <Button size="icon-sm" variant="ghost" onClick={() => setRemoving(f)} aria-label={`Remove ${f.display_name}`}>
                        <UserMinus />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="size-5 text-primary" aria-hidden /> Add a friend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={send} className="space-y-3">
              <Label htmlFor="friend-username">Their username</Label>
              <Input id="friend-username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="student_ab12cd34" autoComplete="off" />
              <Button type="submit" className="w-full" disabled={!username.trim() || busy !== null}>
                {busy === "send" && <Loader2 className="animate-spin" />} Send request
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Swords className="size-5 text-violet" aria-hidden /> Invite to a match
            </CardTitle>
            <CardDescription>Create a room, then share its code or invite link with friends.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="violet" className="w-full">
              <Link href="/play">Create a room</Link>
            </Button>
          </CardContent>
        </Card>
        {outgoing.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Sent requests</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {outgoing.map((r) => (
                  <li key={r.id} className="flex items-center gap-2">
                    <span className="flex-1 truncate">{r.display_name} <span className="text-muted-foreground">@{r.username}</span></span>
                    <Button size="sm" variant="ghost" onClick={() => act(`can-${r.id}`, { action: "cancel", requestId: r.id })} disabled={busy !== null}>
                      Cancel
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.display_name ?? "friend"}?`}
        description="You'll stop seeing each other's activity and friend leaderboard entries. You can send a new request later."
        confirmLabel="Remove friend"
        destructive
        onConfirm={() => removing && void act(`rm-${removing.friend_id}`, { action: "remove", friendId: removing.friend_id }).then((x) => x && toast.success("Friend removed"))}
      />
    </div>
  );
}
