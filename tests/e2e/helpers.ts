import { expect, type Page } from "@playwright/test";

/** Answers every question in the open session, picking the given choice index (or typing a number). */
export async function answerAndSubmit(page: Page, count: number, pick: (i: number) => number = () => 0) {
  await expect(page.getByText(`of ${count}`, { exact: true })).toBeVisible();
  for (let i = 0; i < count; i++) {
    const radios = page.getByRole("radio");
    const boxes = page.getByRole("checkbox");
    if ((await radios.count()) > 0) await radios.nth(pick(i)).click();
    else if ((await boxes.count()) > 0) await boxes.nth(pick(i)).click();
    else await page.getByLabel("Your answer").fill("2");
    if (i < count - 1) await page.getByRole("button", { name: "Next question" }).click();
  }
  await page.getByRole("button", { name: /Review & submit/ }).click();
  await page.getByRole("button", { name: "Submit session" }).click();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await page.waitForURL(/\/results\//);
  await expect(page.getByText("Accuracy").first()).toBeVisible();
}

export async function startQuick(page: Page, track: string, opts: { section?: string; count?: "5" | "10" | "20" } = {}) {
  await page.goto(`/study/${track}?mode=quick`);
  if (opts.section) await page.getByRole("checkbox", { name: opts.section }).click();
  await page.getByRole("radio", { name: opts.count ?? "5", exact: true }).click();
  await page.getByRole("button", { name: "Start session" }).click();
  await page.waitForURL(/\/practice\//);
}
