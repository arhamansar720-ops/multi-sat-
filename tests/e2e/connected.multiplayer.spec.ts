import { expect, test, type Browser, type Page } from "@playwright/test";
import { answerAndSubmit, startQuick } from "./helpers";

/**
 * Runs against a deployment connected to Supabase with email confirmation
 * disabled and anonymous sign-ins enabled (the local `supabase start` config).
 *   E2E_CONNECTED_URL=http://localhost:3000 npx playwright test --project=connected
 */
async function signUp(page: Page, name: string) {
  const email = `${name.toLowerCase()}-${Date.now()}@example.com`;
  await page.goto("/auth/sign-up");
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/onboarding/);
  return email;
}

async function newPage(browser: Browser) {
  const ctx = await browser.newContext();
  return ctx.newPage();
}

test("TEST 5: results persist after signing out and back in, and resubmission is idempotent", async ({ page }) => {
  const email = await signUp(page, "Alice");
  await startQuick(page, "sat", { section: "Math" });
  await answerAndSubmit(page, 5);
  const resultsUrl = page.url();
  const score = await page.getByText(/^\d+ \/ 5$/).textContent();

  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await page.goto(resultsUrl);
  await expect(page.getByText("No results yet")).toBeVisible();

  await page.goto("/auth/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByText("Recent sessions")).toBeVisible();
  await page.goto(resultsUrl);
  await expect(page.getByText(/^\d+ \/ 5$/)).toHaveText(score!);

  const sessionId = resultsUrl.split("/").pop();
  const before = await (await page.request.get("/api/me/activity")).json();
  const replay = await page.request.post(`/api/sessions/${sessionId}/submit`, { data: { answers: {}, flagged: [], timeSpentMs: {} } });
  expect(replay.ok()).toBeTruthy();
  const after = await (await page.request.get("/api/me/activity")).json();
  const total = (a: { activity: { xpLedger: { amount: number }[] } }) => a.activity.xpLedger.reduce((s, e) => s + e.amount, 0);
  expect(total(after)).toBe(total(before));
});

test("TEST 6-7: two players share a live, server-validated match", async ({ browser }) => {
  const host = await newPage(browser);
  const guest = await newPage(browser);
  await signUp(host, "Hosty");
  await host.goto("/play");
  await host.getByRole("radio", { name: "5", exact: true }).click();
  await host.getByRole("radio", { name: "15s" }).click();
  await host.getByRole("button", { name: "Create room" }).click();
  await host.waitForURL(/\/play\/[A-Z0-9]{6}$/);
  const code = host.url().split("/").pop()!;
  await expect(host.getByText("Live updates connected")).toBeVisible();

  // Room codes alone don't grant access: non-members get only a preview.
  await guest.goto(`/play/${code}`);
  await guest.getByLabel("Display name").fill("Guesty");
  await guest.getByRole("button", { name: "Continue as guest" }).click();
  const preview = await (await guest.request.get(`/api/rooms/${code}`)).json();
  expect(preview.state).toBeUndefined();
  expect(preview.preview.code).toBe(code);
  await guest.getByRole("button", { name: "Join room" }).click();

  await expect(host.getByRole("listitem").filter({ hasText: "Guesty" })).toBeVisible();
  await guest.getByRole("button", { name: "I'm ready" }).click();
  await expect(host.getByText("Ready", { exact: true })).toBeVisible();
  await host.getByRole("button", { name: "Start match" }).click();

  for (let i = 0; i < 5; i++) {
    for (const [p, choice] of [[guest, 1], [host, 0]] as const) {
      await expect(p.getByRole("button", { name: "Lock in answer" })).toBeVisible({ timeout: 25_000 });
      // Both players see the same question.
      if (p === host) expect(await host.locator(".prose-question").first().textContent()).toBe(await guest.locator(".prose-question").first().textContent());
      const radios = p.getByRole("radio");
      const boxes = p.getByRole("checkbox");
      if ((await radios.count()) > 0) await radios.nth(choice).click();
      else if ((await boxes.count()) > 0) await boxes.nth(choice).click();
      else await p.getByLabel("Your answer").fill(String(choice + 1));
      await p.getByRole("button", { name: "Lock in answer" }).click();
      if (i === 0 && p === guest) {
        await expect(guest.getByText("Answer locked in")).toBeVisible();
        const { state } = await (await guest.request.get(`/api/rooms/${code}`)).json();
        // Correctness is hidden until the reveal.
        expect(state.match.reveal).toBeNull();
        const dup = await guest.request.post(`/api/rooms/${code}/answer`, { data: { matchId: state.match.id, index: state.match.index, response: ["A"] } });
        expect(dup.status()).toBe(409);
        expect((await dup.json()).error.code).toBe("duplicate_answer");
      }
    }
    await expect(host.getByText(/Correct!|Not this time|No answer/)).toBeVisible({ timeout: 15_000 });
    await expect(host.getByText(/Correct answer|Accepted answer/).first()).toBeVisible();
  }
  for (const p of [host, guest]) {
    await expect(p.getByText("Final rankings")).toBeVisible({ timeout: 30_000 });
    await expect(p.getByText(/You earned \d+ XP|No XP this match/)).toBeVisible({ timeout: 15_000 });
  }
  const hostState = (await (await host.request.get(`/api/rooms/${code}`)).json()).state;
  const guestState = (await (await guest.request.get(`/api/rooms/${code}`)).json()).state;
  expect(hostState.match.standings.map((s: { score: number }) => s.score)).toEqual(guestState.match.standings.map((s: { score: number }) => s.score));
});

test("invalid and unknown room codes give clear errors", async ({ page }) => {
  await signUp(page, "Rover");
  await page.goto("/play/ZZZZZZ");
  await expect(page.getByText("Room not found")).toBeVisible();
  await page.goto("/play/abc");
  await expect(page.getByText("That isn't a valid room code")).toBeVisible();
});
