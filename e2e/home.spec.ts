import { test, expect } from "@playwright/test";

// Smoke test proving the e2e harness works end to end: the app builds, serves,
// and renders the placeholder home page and health route.
test("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "HoldCo OS" })).toBeVisible();
});

test("health route returns ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.status).toBe("ok");
});
