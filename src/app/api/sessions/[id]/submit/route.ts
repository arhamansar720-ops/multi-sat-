import { z } from "zod";
import { ok, rateLimit, readJson, route } from "@/lib/server/http";
import { submitSessionForUser } from "@/lib/server/sessions";
import { requireUser } from "@/lib/server/auth";

const submitSchema = z.object({
  answers: z.record(z.string().max(64), z.array(z.string().max(16)).max(6)),
  flagged: z.array(z.string().max(64)).max(60),
  timeSpentMs: z.record(z.string().max(64), z.number().min(0).max(86_400_000)),
});

export const POST = route(async (request: Request, ctx: RouteContext<"/api/sessions/[id]/submit">) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  rateLimit(`session:submit:${user.id}`, 20, 60_000);
  const body = submitSchema.parse(await readJson(request));
  const result = await submitSessionForUser(user, id, body);
  return ok({ result });
});
