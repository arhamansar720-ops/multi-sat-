import { z } from "zod";
import { getQuestion } from "@/lib/content/bank";
import { dbError, fail, ok, rateLimit, readJson, route } from "@/lib/server/http";
import { ensureQuestionBank } from "@/lib/server/question-sync";
import { requireUser } from "@/lib/supabase/server";

const schema = z.object({ questionId: z.string().max(64), saved: z.boolean() });

export const POST = route(async (request: Request) => {
  const { user, userDb, admin } = await requireUser();
  rateLimit(`saved:${user.id}`, 60, 60_000);
  const { questionId, saved } = schema.parse(await readJson(request));
  if (!getQuestion(questionId)) return fail(404, "not_found", "Unknown question.");
  await ensureQuestionBank(admin);
  const { error } = saved
    ? await userDb.from("saved_questions").upsert({ user_id: user.id, question_id: questionId })
    : await userDb.from("saved_questions").delete().eq("user_id", user.id).eq("question_id", questionId);
  if (error) dbError(error, "saved question");
  return ok({ saved });
});
