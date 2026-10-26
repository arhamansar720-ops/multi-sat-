import { expect, test } from "@playwright/test";
import { answerAndSubmit, startQuick } from "./helpers";

test("mobile: navigation and a full practice session", async ({ page }) => {
  await page.goto("/dashboard");
  const nav = page.getByRole("navigation", { name: "Main mobile" });
  await expect(nav).toBeVisible();
  await nav.getByRole("link", { name: "Study" }).click();
  await expect(page).toHaveURL(/\/study$/);
  await startQuick(page, "ap-statistics");
  await answerAndSubmit(page, 5);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
