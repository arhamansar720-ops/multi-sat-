import { defineConfig, devices } from "@playwright/test";

/**
 * Two suites:
 * - demo: builds and serves the app in demo mode (no backend) on port 3100.
 * - connected: runs against an already-running app connected to Postgres
 *   (set E2E_CONNECTED_URL, e.g. http://localhost:3000 with DATABASE_URL set).
 */
const connectedUrl = process.env.E2E_CONNECTED_URL;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
  projects: [
    { name: "demo", testMatch: "**/demo.*.spec.ts", use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3100" } },
    { name: "demo-mobile", testMatch: "**/mobile.*.spec.ts", use: { ...devices["Pixel 7"], baseURL: "http://localhost:3100" } },
    ...(connectedUrl ? [{ name: "connected", testMatch: "**/connected.*.spec.ts", use: { ...devices["Desktop Chrome"], baseURL: connectedUrl } }] : []),
  ],
  webServer: {
    command: "NEXT_DIST_DIR=.next-demo NEXT_PUBLIC_FORCE_DEMO_MODE=true npx next build && NEXT_DIST_DIR=.next-demo NEXT_PUBLIC_FORCE_DEMO_MODE=true npx next start -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
