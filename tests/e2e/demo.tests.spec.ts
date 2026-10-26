import { expect, test, type Page } from "@playwright/test";

async function closeDirections(page: Page) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).first().click();
  await expect(dialog).toBeHidden();
}

async function answerModule(page: Page, count: number) {
  await expect(page.getByRole("button", { name: `Question 1 of ${count}` })).toBeVisible();
  for (let i = 0; i < count; i++) {
    const radios = page.getByRole("radio");
    if ((await radios.count()) > 0) await radios.first().click();
    else await page.getByLabel("Your answer").fill("2");
    await page.getByRole("button", { name: /^Next/ }).click();
  }
  await expect(page.getByRole("heading", { name: "Check Your Work" })).toBeVisible();
}

async function confirm(page: Page, label: string) {
  await page.getByRole("button", { name: label }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: label }).click();
}

test.describe("course search and Bluebook-style practice tests", () => {
  test("course search finds courses by nickname and links to official resources", async ({ page }) => {
    await page.goto("/courses");
    await page.getByLabel("Search courses").fill("apush");
    await expect(page.getByRole("link", { name: /AP United States History/ }).first()).toBeVisible();
    await page.getByLabel("Search courses").fill("latin");
    await page.getByRole("link", { name: /AP Latin/ }).click();
    await expect(page.getByText("No StudyDuel practice tests for this course yet")).toBeVisible();
    const official = page.getByRole("link", { name: /AP course and exam overview/ });
    await expect(official).toHaveAttribute("href", /^https:\/\/apstudents\.collegeboard\.org\/courses\/ap-latin$/);
    await expect(official).toHaveAttribute("target", "_blank");
  });

  test("SAT practice test: modules, locked modules, break, and score report", async ({ page }) => {
    await page.goto("/courses/sat");
    await page.getByRole("button", { name: "Start test" }).click();
    await page.waitForURL(/\/practice\//);
    await expect(page.getByText("Section 1, Module 1: Reading and Writing").first()).toBeVisible();
    await closeDirections(page);
    await expect(page.getByRole("timer")).toContainText(/^\d+:\d\d$/);

    // Answer eliminator and mark for review.
    await page.getByRole("button", { name: "Answer eliminator" }).click();
    await page.getByRole("button", { name: "Eliminate choice D" }).click();
    await expect(page.getByRole("radio", { name: /Choice D: .*\(eliminated\)/ })).toBeVisible();
    await page.getByRole("button", { name: "Answer eliminator" }).click();
    await page.getByRole("button", { name: "Mark for Review" }).click();

    await answerModule(page, 7);
    await expect(page.getByRole("button", { name: /Question 1: answered, marked for review/ })).toBeVisible();
    await confirm(page, "Next module");

    await expect(page.getByText("Section 1, Module 2: Reading and Writing").first()).toBeVisible();
    await closeDirections(page);
    // No way back into module 1.
    await expect(page.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);
    await answerModule(page, 8);
    await confirm(page, "Next module");

    await expect(page.getByText("Remaining break time")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Remaining break time")).toBeVisible();
    await page.getByRole("button", { name: "Resume testing" }).click();

    await expect(page.getByText("Section 2, Module 1: Math").first()).toBeVisible();
    await closeDirections(page);
    await page.getByRole("button", { name: "Reference" }).click();
    await expect(page.getByRole("dialog", { name: "Reference sheet" })).toBeVisible();
    await page.keyboard.press("Escape");
    await answerModule(page, 9);
    await confirm(page, "Next module");
    await expect(page.getByText("Section 2, Module 2: Math").first()).toBeVisible();
    await closeDirections(page);
    await answerModule(page, 9);
    await confirm(page, "Submit test");

    await page.waitForURL(/\/results\//);
    await expect(page.getByRole("heading", { name: "Score report" })).toBeVisible();
    await expect(page.getByText("Reading and Writing: Module 2")).toBeVisible();
    await expect(page.getByText(/doesn't convert these to a scaled or predicted score/)).toBeVisible();

    await page.goto("/courses/sat");
    await expect(page.getByText(/Best \d+\/33 · taken 1×/)).toBeVisible();
  });

  test("AP practice test runs as a single timed section", async ({ page }) => {
    await page.goto("/courses/ap-biology");
    await page.getByRole("button", { name: "Start test" }).click();
    await page.waitForURL(/\/practice\//);
    await expect(page.getByText("Section I: Multiple Choice").first()).toBeVisible();
    await closeDirections(page);
    await answerModule(page, 5);
    await confirm(page, "Submit test");
    await page.waitForURL(/\/results\//);
    await expect(page.getByText("Multiple Choice", { exact: true })).toBeVisible();
  });
});
