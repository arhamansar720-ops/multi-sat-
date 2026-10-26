import { z } from "zod";
import { parseNumericAnswer } from "./grading";

const choiceSchema = z.object({ id: z.string().min(1).max(4), text: z.string().min(1) });

const figureSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("table"),
    caption: z.string().optional(),
    columns: z.array(z.string()).min(1),
    rows: z.array(z.array(z.string())).min(1),
  }),
  z.object({
    kind: z.literal("chart"),
    chartType: z.enum(["bar", "line", "scatter"]),
    title: z.string().optional(),
    xLabel: z.string(),
    yLabel: z.string(),
    data: z.array(z.object({ x: z.union([z.string(), z.number()]), y: z.number() })).min(2),
  }),
  z.object({
    kind: z.literal("image"),
    src: z.string().regex(/^\/figures\/[a-z0-9-]+\.(svg|png|webp)$/, "Images must live in /public/figures"),
    alt: z.string().min(10),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
]);

export const questionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/, "ids are lowercase kebab-case"),
    exam: z.string().min(1),
    course: z.string().min(1),
    section: z.string().min(1),
    topic: z.string().min(1),
    skill: z.string().min(1),
    difficulty: z.enum(["easy", "medium", "hard"]),
    type: z.enum(["mcq", "multi", "numeric"]),
    prompt: z.string().min(10),
    passage: z
      .object({ title: z.string().optional(), text: z.string().min(20), source: z.string().optional() })
      .optional(),
    figure: figureSchema.optional(),
    choices: z.array(choiceSchema).min(2).max(6).optional(),
    correct: z.array(z.string().min(1)).min(1),
    tolerance: z.number().positive().optional(),
    explanation: z.string().min(30),
    hint: z.string().min(5).optional(),
    estimatedSeconds: z.number().int().min(15).max(600),
    tags: z.array(z.string()),
    version: z.number().int().positive(),
  })
  .superRefine((q, ctx) => {
    if (q.type === "numeric") {
      if (q.choices?.length) ctx.addIssue({ code: "custom", message: "numeric questions must not have choices" });
      for (const value of q.correct) {
        if (parseNumericAnswer(value) === null) {
          ctx.addIssue({ code: "custom", message: `numeric answer "${value}" is not parseable` });
        }
      }
      return;
    }
    if (!q.choices || q.choices.length < 2) {
      ctx.addIssue({ code: "custom", message: "choice questions need at least two choices" });
      return;
    }
    const ids = q.choices.map((c) => c.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "duplicate choice ids" });
    const texts = q.choices.map((c) => c.text.trim().toLowerCase());
    if (new Set(texts).size !== texts.length) ctx.addIssue({ code: "custom", message: "duplicate choice text" });
    for (const c of q.correct) {
      if (!ids.includes(c)) ctx.addIssue({ code: "custom", message: `correct id "${c}" is not a choice` });
    }
    if (q.type === "mcq" && q.correct.length !== 1) {
      ctx.addIssue({ code: "custom", message: "mcq must have exactly one correct choice" });
    }
    if (q.type === "multi" && q.correct.length < 2) {
      ctx.addIssue({ code: "custom", message: "multi-select must have at least two correct choices" });
    }
  });

export const questionFileSchema = z.object({
  $schema: z.string().optional(),
  questions: z.array(questionSchema),
});
