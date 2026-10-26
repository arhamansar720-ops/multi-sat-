import { describe, expect, it } from "vitest";
import { isResponseCorrect, parseNumericAnswer, sanitizeResponse } from "@/lib/content/grading";

describe("parseNumericAnswer", () => {
  it.each([
    ["3", 3], ["-1", -1], [".5", 0.5], ["0.75", 0.75], ["3/4", 0.75], ["-3/4", -0.75], [" 12 ", 12], ["1,000", 1000],
  ])("parses %s", (raw, value) => expect(parseNumericAnswer(raw)).toBeCloseTo(value));
  it.each(["", "abc", "1/0", "3//4", "--2", "1e5", "Infinity"])("rejects %s", (raw) => expect(parseNumericAnswer(raw)).toBeNull());
});

describe("isResponseCorrect", () => {
  const numeric = { type: "numeric" as const, correct: ["1/2", "0.5"] };
  it("accepts equivalent numeric forms", () => {
    expect(isResponseCorrect(numeric, ["2/4"])).toBe(true);
    expect(isResponseCorrect(numeric, [".5"])).toBe(true);
    expect(isResponseCorrect(numeric, ["0.51"])).toBe(false);
  });
  it("honors tolerance", () => {
    expect(isResponseCorrect({ type: "numeric", correct: ["35"], tolerance: 0.5 }, ["35.4"])).toBe(true);
  });
  it("requires exact sets for multi-select (no partial credit)", () => {
    const multi = { type: "multi" as const, correct: ["A", "C"] };
    expect(isResponseCorrect(multi, ["C", "A"])).toBe(true);
    expect(isResponseCorrect(multi, ["A"])).toBe(false);
    expect(isResponseCorrect(multi, ["A", "B", "C"])).toBe(false);
  });
  it("treats empty responses as incorrect", () => {
    expect(isResponseCorrect({ type: "mcq", correct: ["A"] }, [])).toBe(false);
    expect(isResponseCorrect({ type: "mcq", correct: ["A"] }, null)).toBe(false);
  });
});

describe("sanitizeResponse", () => {
  const q = { type: "mcq" as const, choices: [{ id: "A", text: "a" }, { id: "B", text: "b" }] };
  it("drops unknown choices and non-strings", () => {
    expect(sanitizeResponse(q, ["Z", 5, "B"])).toEqual(["B"]);
    expect(sanitizeResponse(q, "A")).toBeNull();
    expect(sanitizeResponse(q, [])).toBeNull();
  });
  it("trims numeric input and limits length", () => {
    expect(sanitizeResponse({ type: "numeric", choices: undefined }, ["  7 "])).toEqual(["7"]);
  });
});
