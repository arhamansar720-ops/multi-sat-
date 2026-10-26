import type { AnswerResponse, Question } from "./types";

/**
 * Parses a student-entered numeric response. Accepts integers, decimals
 * (including ".5"), negative values, and simple fractions like "-3/4".
 * Returns null for anything else so malformed input is never "correct".
 */
export function parseNumericAnswer(raw: string): number | null {
  const value = raw.trim().replace(/\s+/g, "").replace(/,/g, "");
  if (value.length === 0 || value.length > 16) return null;
  const fraction = /^(-?)(\d+)\/(\d+)$/.exec(value);
  if (fraction) {
    const denominator = Number(fraction[3]);
    if (denominator === 0) return null;
    const result = Number(fraction[2]) / denominator;
    return fraction[1] === "-" ? -result : result;
  }
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isResponseCorrect(question: Pick<Question, "type" | "correct" | "tolerance">, response: AnswerResponse | null | undefined): boolean {
  if (!response || response.length === 0) return false;
  if (question.type === "numeric") {
    const given = parseNumericAnswer(response[0] ?? "");
    if (given === null) return false;
    const tolerance = question.tolerance ?? 0.0001;
    return question.correct.some((accepted) => {
      const target = parseNumericAnswer(accepted);
      return target !== null && Math.abs(target - given) <= tolerance;
    });
  }
  const selected = new Set(response);
  if (question.type === "mcq") return selected.size === 1 && selected.has(question.correct[0] ?? "");
  // multi-select: exact set match, no partial credit
  return selected.size === question.correct.length && question.correct.every((id) => selected.has(id));
}

/** Validates the shape of a response for a given question (server-side input validation). */
export function sanitizeResponse(question: Pick<Question, "type" | "choices">, response: unknown): AnswerResponse | null {
  if (!Array.isArray(response)) return null;
  const strings = response.filter((r): r is string => typeof r === "string").slice(0, 6);
  if (strings.length === 0) return null;
  if (question.type === "numeric") {
    const value = strings[0]!.slice(0, 16);
    return value.trim() ? [value.trim()] : null;
  }
  const valid = new Set((question.choices ?? []).map((c) => c.id));
  const unique = [...new Set(strings.filter((s) => valid.has(s)))];
  if (unique.length === 0) return null;
  return question.type === "mcq" ? [unique[0]!] : unique.sort();
}

export function formatCorrectAnswer(question: Question): string {
  if (question.type === "numeric") return question.correct.join(" or ");
  return question.correct
    .map((id) => {
      const choice = question.choices?.find((c) => c.id === id);
      return choice ? `${id}) ${choice.text}` : id;
    })
    .join("; ");
}
