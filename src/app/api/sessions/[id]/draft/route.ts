import { z } from "zod";
import { ok, rateLimit, readJson, route } from "@/lib/server/http";
import { saveDraftForUser } from "@/lib/server/sessions";
import { requireUser } from "@/lib/supabase/server";

const draftSchema = z.object({
  answers: z.record(z.string().max(64), z.array(z.string().max(16)).max(6)),
  flagged: z.array(z.string().max(64)).max(60),
  eliminated: z.record(z.string().max(64), z.array(z.string().max(4)).max(6)),
  checked: z.array(z.string().max(64)).max(60),
  currentIndex: z.number().int().min(0).max(60),
  timeSpentMs: z.record(z.string().max(64), z.number().min(0).max(86_400_000)),
  updatedAt: z.string().max(40),
});

export const PUT = route(async (request: Request, ctx: RouteContext<"/api/sessions/[id]/draft">) => {
  const { id } = await ctx.params;
  const { user, admin } = await requireUser();
  rateLimit(`session:draft:${user.id}`, 120, 60_000);
  const draft = draftSchema.parse(await readJson(request));
  return ok(await saveDraftForUser(admin, user, id, draft));
});
