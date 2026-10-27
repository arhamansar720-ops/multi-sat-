import { z } from "zod";
import { getTrack } from "@/lib/content/catalog";
import { displayNameSchema } from "@/lib/multiplayer/rules";
import { safeTimeZone } from "@/lib/progression/dates";
import { requireUser } from "@/lib/server/auth";
import { isUniqueViolation, query } from "@/lib/server/db";
import { fail, ok, rateLimit, readJson, route } from "@/lib/server/http";

const prefsSchema = z.object({
  displayName: displayNameSchema.optional(),
  username: z.string().regex(/^[a-zA-Z0-9_]{3,20}$/, "Usernames are 3-20 letters, numbers, or underscores.").optional(),
  tracks: z.array(z.string().max(64)).max(12).optional(),
  classes: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  targetScore: z.number().int().min(1).max(1600).nullable().optional(),
  dailyMinutes: z.number().int().min(5).max(240).optional(),
  focusSkills: z.array(z.string().max(120)).max(20).optional(),
  timezone: z.string().max(64).optional(),
  onboarded: z.boolean().optional(),
  leaderboardOptIn: z.boolean().optional(),
  shareActivityWithFriends: z.boolean().optional(),
  reminderEmails: z.boolean().optional(),
});

export const PUT = route(async (request: Request) => {
  const user = await requireUser();
  rateLimit(`prefs:${user.id}`, 30, 60_000);
  const p = prefsSchema.parse(await readJson(request));
  if (p.tracks?.some((t) => !getTrack(t))) return fail(400, "unknown_track", "One of the selected exams does not exist.");

  // Only these whitelisted columns can change, and only on the caller's own rows.
  const profilePatch: Record<string, unknown> = {};
  if (p.displayName !== undefined) profilePatch.display_name = p.displayName;
  if (p.username !== undefined) profilePatch.username = p.username;
  if (p.leaderboardOptIn !== undefined) profilePatch.leaderboard_opt_in = p.leaderboardOptIn;
  if (p.shareActivityWithFriends !== undefined) profilePatch.share_activity_with_friends = p.shareActivityWithFriends;
  if (Object.keys(profilePatch).length) {
    try {
      await updateRow("profiles", "id", user.id, profilePatch);
    } catch (err) {
      if (isUniqueViolation(err)) return fail(409, "username_taken", "That username is already taken.");
      throw err;
    }
  }

  const prefPatch: Record<string, unknown> = {};
  if (p.tracks !== undefined) prefPatch.tracks = p.tracks;
  if (p.classes !== undefined) prefPatch.classes = p.classes;
  if (p.targetDate !== undefined) prefPatch.target_date = p.targetDate;
  if (p.targetScore !== undefined) prefPatch.target_score = p.targetScore;
  if (p.dailyMinutes !== undefined) prefPatch.daily_minutes = p.dailyMinutes;
  if (p.focusSkills !== undefined) prefPatch.focus_skills = p.focusSkills;
  if (p.timezone !== undefined) prefPatch.timezone = safeTimeZone(p.timezone);
  if (p.onboarded !== undefined) prefPatch.onboarded = p.onboarded;
  if (p.reminderEmails !== undefined) prefPatch.reminder_emails = p.reminderEmails;
  if (Object.keys(prefPatch).length) {
    await updateRow("user_preferences", "user_id", user.id, prefPatch);
  }
  return ok({ saved: true });
});

/** Column names come from the fixed patch keys above, never from user input. */
async function updateRow(table: "profiles" | "user_preferences", key: "id" | "user_id", id: string, patch: Record<string, unknown>) {
  const cols = Object.keys(patch);
  const sets = cols.map((c, i) => `${c} = $${i + 2}`).join(", ");
  await query(`update public.${table} set ${sets} where ${key} = $1`, [id, ...cols.map((c) => patch[c])]);
}
