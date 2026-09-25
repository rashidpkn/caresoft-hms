import { test, expect } from "@playwright/test";

test("login rejects bad credentials and accepts demo admin", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid username or password")).toBeVisible();

  await page.getByLabel("Password").fill("ChangeMe_Admin_1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 15000 });
});

test("pharmacist cannot call user admin API", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("pharmacist");
  await page.getByLabel("Password").fill("Hospital_Demo_1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 15000 });
  const res = await page.request.get("/api/users");
  expect(res.status()).toBe(403);
});
