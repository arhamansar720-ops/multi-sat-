import { ok, rateLimit, readJson, route } from "@/lib/server/http";
import { createSessionForUser, listInProgressForUser } from "@/lib/server/sessions";
import { requireUser } from "@/lib/server/auth";

export const POST = route(async (request: Request) => {
  const user = await requireUser();
  rateLimit(`session:create:${user.id}`, 20, 60_000);
  const body = (await readJson(request)) as { config?: unknown };
  const session = await createSessionForUser(user, body.config);
  return ok({ session }, { status: 201 });
});

export const GET = route(async () => {
  const user = await requireUser();
  return ok({ sessions: await listInProgressForUser(user) });
});
