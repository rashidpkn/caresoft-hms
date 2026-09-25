import { test, expect, type Page } from "@playwright/test";

const DEMO_PASSWORD = "Hospital_Demo_1";

async function signIn(page: Page, username: string, password = DEMO_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 20000 });
}

test("receptionist books a slot and checks the patient in", async ({ page }) => {
  await signIn(page, "receptionist");
  await expect(page.getByRole("heading", { name: "Today's appointments" })).toBeVisible();

  await page.getByRole("link", { name: "Front desk", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Front desk" })).toBeVisible();

  await page.getByLabel("Patient", { exact: true }).selectOption({ index: 1 });
  await page.getByLabel("Doctor", { exact: true }).selectOption({ index: 1 });

  const slot = page.locator("button", { hasText: /^\d{2}:\d{2}$/ }).first();
  await expect(slot).toBeVisible();
  await slot.click();
  await page.getByRole("button", { name: "Book appointment" }).click();
  await expect(page.getByText("Appointment booked.")).toBeVisible();

  const checkInButton = page.getByRole("button", { name: "Check in" }).first();
  await expect(checkInButton).toBeVisible();
  await checkInButton.click();
  await expect(page.getByText(/Checked in\. Token #/)).toBeVisible();
});

test("doctor works the queue, documents a consultation and finalizes it", async ({ page }) => {
  await signIn(page, "doctor");
  await expect(page.getByRole("heading", { name: "My waiting patients" })).toBeVisible();

  await page.getByRole("link", { name: "My clinic", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My clinic" })).toBeVisible();

  await page.getByRole("button", { name: "Start consultation" }).first().click();
  await expect(page.getByRole("heading", { name: /Meera|Queue|Rahul|Fatima/ })).toBeVisible({ timeout: 20000 });

  await page.getByLabel("Symptoms").fill("Fever for two days, dry cough");
  await page.getByLabel("Diagnoses (one per line, first is primary)").fill("Acute viral fever");
  await page.getByRole("button", { name: "Save clinical notes" }).click();
  await expect(page.getByText("Clinical notes saved.")).toBeVisible();

  await page.getByLabel("Pulse").fill("82");
  await page.getByLabel("Systolic").fill("124");
  await page.getByLabel("Diastolic").fill("78");
  await page.getByRole("button", { name: "Record vitals" }).click();
  await expect(page.getByText("Vitals recorded.")).toBeVisible();

  await page.getByLabel("Medicine").first().fill("Paracetamol 500mg");
  await page.getByLabel("Dosage").first().fill("1 tablet");
  await page.getByLabel("Frequency").first().fill("TID");
  await page.getByLabel("Duration").first().fill("5 days");
  await page.getByRole("button", { name: "Save prescription" }).click();
  await expect(page.getByText("Prescription added.")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Finalize encounter" }).click();
  await expect(page.getByText("This encounter is finalized.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Symptoms")).toBeDisabled();
});

test("pharmacist dispenses stock and the bill appears as paid", async ({ page }) => {
  await signIn(page, "pharmacist");
  await expect(page.getByText("Low stock")).toBeVisible();

  await page.getByRole("link", { name: "Pharmacy counter" }).click();
  await expect(page.getByRole("heading", { name: "Pharmacy counter" })).toBeVisible();

  await page.getByRole("button", { name: "Add" }).first().click();
  await expect(page.getByText("Payable")).toBeVisible();
  await page.getByRole("button", { name: "Complete sale" }).click();
  await expect(page.getByText(/Bill INV\d+ completed/)).toBeVisible();
  await expect(page.getByText("Recent pharmacy bills")).toBeVisible();
});

test("pharmacist cannot see staff administration in the UI or the API", async ({ page }) => {
  await signIn(page, "pharmacist");
  await expect(page.getByRole("link", { name: "Staff accounts" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Audit log" })).toHaveCount(0);
  const res = await page.request.get("/api/users");
  expect(res.status()).toBe(403);
});

test("lab attendant collects, technician enters, verifier releases", async ({ page }) => {
  await signIn(page, "labatt");
  await page.getByRole("link", { name: "Laboratory" }).click();
  await expect(page.getByRole("heading", { name: "Laboratory worklist" })).toBeVisible();
  await page.getByRole("button", { name: "Collect sample" }).first().click();
  await expect(page.getByText("Sample collected and labelled.")).toBeVisible();
  // Attendants must not be able to enter results.
  const attendantResults = await page.request.post("/api/lab/results", {
    data: { orderItemId: "00000000-0000-0000-0000-000000000000", value: "5" },
  });
  expect(attendantResults.status()).toBe(403);

  await signIn(page, "labtech");
  await page.getByRole("link", { name: "Laboratory" }).click();
  await page.getByRole("button", { name: "In processing" }).click();
  await page.getByRole("link", { name: "Open" }).first().click();
  await expect(page.getByRole("heading", { name: /Lab order LAB/ })).toBeVisible();
  await page.getByRole("button", { name: "Mark received" }).first().click();
  await expect(page.getByText("Sample received in the lab.")).toBeVisible();
  await page.getByRole("textbox", { name: /^Result for/ }).first().fill("12.8");
  await page.getByRole("button", { name: "Save result" }).first().click();
  await expect(page.getByText("Result saved and sent for verification.")).toBeVisible();
  const verifyButton = page.getByRole("button", { name: "Verify" }).first();
  if (await verifyButton.count()) {
    await expect(verifyButton).toBeDisabled();
  }

  const orderUrl = page.url();
  await signIn(page, "labver");
  await page.goto(orderUrl);
  await page.getByRole("button", { name: "Verify" }).first().click();
  await expect(page.getByText("Result verified and released.")).toBeVisible();
});
