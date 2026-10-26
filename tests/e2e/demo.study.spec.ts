import { expect, test } from "@playwright/test";
import { answerAndSubmit, startQuick } from "./helpers";

test.describe("demo mode solo study", () => {
  test("TEST 1-2: SAT Math practice, accurate results, and updated progress", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Study smarter. Compete harder." })).toBeVisible();
    await expect(page.getByText("Demo mode.")).toBeVisible();
    await page.getByRole("link", { name: "Start studying" }).first().click();
    await expect(page).toHaveURL(/\/study$/);

    await startQuick(page, "sat", { section: "Math" });
    await expect(page.getByText(/SAT · Math ·/)).toBeVisible();
    await answerAndSubmit(page, 5);
    const score = await page.getByText(/^\d+ \/ 5$/).textContent();
    const correct = Number(score!.split("/")[0]);
    await expect(page.getByText("Practice results. Short quizzes do not produce an official or predicted exam score.")).toBeVisible();
    // Missed questions come with explanations; the first one is expanded.
    if (correct < 5) await expect(page.getByText("Correct answer:").first()).toBeVisible();

    await page.goto("/dashboard");
    await expect(page.getByText("Questions answered")).toBeVisible();
    await expect(page.getByText("Recent sessions")).toBeVisible();

    // Second session updates progress.
    await startQuick(page, "sat", { section: "Math" });
    await answerAndSubmit(page, 5, () => 1);
    await page.goto("/progress");
    await expect(page.getByText("2 sessions", { exact: true })).toBeVisible();
    await expect(page.getByText(/^\d+ of 10$/)).toBeVisible();
  });

  test("TEST 3: AP Environmental Science subject quiz", async ({ page }) => {
    await page.goto("/study");
    await page.getByRole("listitem").filter({ hasText: "AP Environmental Science" }).getByRole("link", { name: "Practice" }).click();
    await expect(page.getByRole("heading", { name: "AP Environmental Science" })).toBeVisible();
    await page.getByRole("radio", { name: "5", exact: true }).click();
    await page.getByRole("button", { name: "Start session" }).click();
    await page.waitForURL(/\/practice\//);
    await expect(page.getByText(/APES ·/)).toBeVisible();
    await answerAndSubmit(page, 5);
    await expect(page.getByRole("heading", { name: /APES/ })).toBeVisible();
  });

  test("TEST 4: mark for review, navigate, return to flagged question", async ({ page }) => {
    await startQuick(page, "sat", { section: "Reading and Writing" });
    await page.getByRole("button", { name: "Next question" }).click();
    await expect(page.getByText("2", { exact: true }).first()).toBeVisible();
    const prompt2 = await page.locator("main .prose-question").first().textContent();
    await page.getByRole("button", { name: "Mark for review" }).click();
    await expect(page.getByRole("button", { name: "Marked for review" })).toBeVisible();
    await page.getByRole("button", { name: "Next question" }).click();
    await page.getByRole("button", { name: "Next question" }).click();
    await page.getByRole("button", { name: /Question 4 of 5/ }).click();
    const flagged = page.getByRole("button", { name: /Question 2: unanswered, marked for review/ });
    await expect(flagged).toBeVisible();
    await flagged.click();
    await expect(page.locator("main .prose-question").first()).toHaveText(prompt2!);
    await expect(page.getByRole("button", { name: "Marked for review" })).toBeVisible();
    // Keyboard navigation works too.
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("button", { name: /Question 3 of 5/ })).toBeVisible();
  });

  test("timed session shows a countdown that can be hidden", async ({ page }) => {
    await page.goto("/study/sat?mode=quick");
    await page.getByRole("switch", { name: "Use a timer" }).click();
    await page.getByRole("radio", { name: "5 min", exact: true }).click();
    await page.getByRole("button", { name: "Start session" }).click();
    await page.waitForURL(/\/practice\//);
    const timer = page.getByRole("timer");
    await expect(timer).toContainText(/[45]:\d\d/);
    await page.getByRole("button", { name: "Hide timer" }).click();
    await expect(timer).toContainText("Hidden");
    // Refresh keeps the same deadline (no reset).
    await page.reload();
    await expect(page.getByRole("timer")).toContainText(/[34]:\d\d/);
  });

  test("TEST 9: online-only features explain themselves in demo mode", async ({ page }) => {
    await page.goto("/leaderboard");
    await expect(page.getByText("Leaderboards needs a connected backend")).toBeVisible();
    await page.goto("/friends");
    await expect(page.getByText("Friends needs a connected backend")).toBeVisible();
    await page.goto("/play");
    await expect(page.getByText("Online multiplayer isn't available in demo mode.")).toBeVisible();
    await page.goto("/play/ABCDEF");
    await expect(page.getByText("Online rooms need a connected backend")).toBeVisible();
    await page.goto("/auth/sign-in");
    await expect(page.getByRole("link", { name: "Continue in demo mode" })).toBeVisible();
    const health = await page.request.get("/api/health");
    expect((await health.json()).mode).toBe("demo");
  });

  test("local practice match against labeled bots", async ({ page }) => {
    await page.goto("/play/local");
    await expect(page.getByText("Your opponents are simulated practice bots")).toBeVisible();
    await page.getByRole("radio", { name: "5", exact: true }).click();
    await page.getByRole("radio", { name: "15s" }).click();
    await page.getByRole("button", { name: "Start match" }).click();
    for (let i = 0; i < 5; i++) {
      await expect(page.getByRole("button", { name: "Lock in answer" })).toBeVisible({ timeout: 30_000 });
      const radios = page.getByRole("radio");
      if ((await radios.count()) > 0) await radios.first().click();
      else await page.getByLabel("Your answer").fill("1");
      await page.getByRole("button", { name: "Lock in answer" }).click();
      await expect(page.getByText(/Correct!|Not this time|No answer/)).toBeVisible({ timeout: 30_000 });
    }
    await expect(page.getByText("Final rankings")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("bot").first()).toBeVisible();
  });

  test("unknown routes and sessions show helpful states", async ({ page }) => {
    await page.goto("/practice/does-not-exist");
    await expect(page.getByText("Session not found")).toBeVisible();
    await page.goto("/study/not-an-exam");
    await expect(page.getByText("Exam not found")).toBeVisible();
    await page.goto("/nope");
    await expect(page.getByText("We couldn't find that page")).toBeVisible();
  });
});
