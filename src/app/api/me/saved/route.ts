import { z } from "zod";
import { getQuestion } from "@/lib/content/bank";
import { requireUser } from "@/lib/server/auth";
import { query } from "@/lib/server/db";
import { fail, ok, rateLimit, readJson, route } from "@/lib/server/http";
import { ensureQuestionBank } from "@/lib/server/question-sync";

const schema = z.object({ questionId: z.string().max(64), saved: z.boolean() });

export const POST = route(async (request: Request) => {
  const user = await requireUser();
  rateLimit(`saved:${user.id}`, 60, 60_000);
  const { questionId, saved } = schema.parse(await readJson(request));
  if (!getQuestion(questionId)) return fail(404, "not_found", "Unknown question.");
  await ensureQuestionBank();
  if (saved) await query("insert into public.saved_questions (user_id, question_id) values ($1, $2) on conflict do nothing", [user.id, questionId]);
  else await query("delete from public.saved_questions where user_id = $1 and question_id = $2", [user.id, questionId]);
  return ok({ saved });
});
