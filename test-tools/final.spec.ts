import { test, expect } from "@playwright/test";
const password = "WhTestOnly2026!";
async function adminLogin(page: any) {
  await page.goto("/admin");
  await page.getByLabel("Admin email", { exact: true }).fill("admin@wh.test");
  await page.getByLabel("Admin password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Email sign in", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Customers", exact: true }),
  ).toBeVisible();
}
test("admin login, customer control and kitchen price forms", async ({
  page,
}) => {
  await adminLogin(page);
  await page.getByRole("button", { name: "Customers", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Customer & staff accounts" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/admin-customers.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Kitchen", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Kitchen", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Price in minor units (5,000 MMK = 500000)").first(),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/admin-kitchen.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Staff", exact: true }).click();
  await expect(page.getByText("kitchen.manage", { exact: true })).toBeVisible();
  await expect(page.getByText("stays.manage", { exact: true })).toBeVisible();
});
for (const mobile of [false, true])
  test(`${mobile ? "mobile" : "desktop"} customer signup, kitchen gate and session separation`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Sign up", exact: true })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await page.screenshot({
      path: `test-results/signup-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: false,
    });
    await dialog
      .getByLabel("Login email", { exact: true })
      .fill(`browser-${Date.now()}-${mobile}@wh.test`);
    await dialog.getByLabel("Login password", { exact: true }).fill(password);
    await dialog.getByLabel("Confirm password", { exact: true }).fill(password);
    await dialog
      .getByLabel("Signup phone", { exact: true })
      .fill("09123456789");
    await dialog.getByRole("button", { name: /Create account/ }).click();
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Your WN account" }),
    ).toBeVisible();
    await page.getByLabel("Profile full name").fill("WN Guest Profile");
    await page.getByLabel("Profile address").fill("Yangon, Myanmar");
    await page
      .getByRole("button", { name: "Save profile", exact: true })
      .click();
    await expect(
      page.getByText("Profile updated.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "WN Guest Profile", exact: true }),
    ).toBeVisible();
    const roomsResponse = await page.request.get("/api/rooms");
    const publicRooms = await roomsResponse.json();
    const imageUrl = publicRooms
      .flatMap((r: any) => r.photo_urls || [])
      .find((url: string) => url.startsWith("/api/photos/"));
    expect(imageUrl).toBeTruthy();
    const imageResponse = await page.request.get(imageUrl);
    await page.getByLabel("Profile photo", { exact: true }).setInputFiles({
      name: "profile.webp",
      mimeType: "image/webp",
      buffer: await imageResponse.body(),
    });
    await expect(
      page.getByText("Profile photo updated.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByAltText("Profile photo", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/profile-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Kitchen & dining", exact: true })
      .click();
    await expect(
      page.getByText("Hotel staff must check you in", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Place room-service order" }),
    ).toHaveCount(0);
    await page.screenshot({
      path: `test-results/customer-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    await page.goto("/admin");
    await expect(page.getByLabel("Admin password")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Customers", exact: true }),
    ).toHaveCount(0);
  });
test("admin supports multiple photo uploads and 40-photo capacity", async ({
  page,
}) => {
  await adminLogin(page);
  await page.getByRole("button", { name: "Rooms", exact: true }).click();
  const input = page.getByLabel("Upload room photo").first();
  await expect(input).toHaveAttribute("multiple", "");
  await expect(page.getByText(/Maximum 40 photos/).first()).toBeVisible();
});
test("password recovery is accessible without Firebase", async ({ page }) => {
  await page.goto("/reset-password#token=invalid");
  await expect(
    page.getByRole("heading", { name: "Password recovery" }),
  ).toBeVisible();
  await expect(page.getByLabel("Recovery code")).toHaveValue("invalid");
  await expect(page).toHaveURL(/reset-password$/);
});

test("owner and staff profile workspace keeps assignment owner-managed", async ({
  page,
  browser,
}) => {
  await adminLogin(page);
  await page.getByRole("button", { name: "My profile", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "My staff profile" }),
  ).toBeVisible();
  await page.getByLabel("Profile full name").fill("WN Administrator");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(
    page.getByText("Profile updated.", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/admin-profile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Staff", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit staff profile", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Staff job title")).toHaveValue("Chef");
  await page.getByLabel("Staff job title").fill("Executive chef");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(
    page.getByText("Profile updated.", { exact: true }),
  ).toBeVisible();
  const context = await browser.newContext();
  const staff = await context.newPage();
  await staff.goto("http://localhost:3000/admin");
  await staff.getByLabel("Admin email", { exact: true }).fill("staff@wh.test");
  await staff.getByLabel("Admin password", { exact: true }).fill(password);
  await staff
    .getByRole("button", { name: "Email sign in", exact: true })
    .click();
  await staff.getByRole("button", { name: "My profile", exact: true }).click();
  await expect(staff.getByLabel("Staff assignment")).toHaveValue(
    "Executive chef · Kitchen",
  );
  await expect(staff.getByLabel("Staff job title")).toHaveCount(0);
  await expect(staff.getByLabel("Staff assignment")).toHaveAttribute(
    "readonly",
    "",
  );
  await staff.screenshot({
    path: "test-results/staff-profile.png",
    fullPage: true,
  });
  await context.close();
});

test("mobile staff workspace fits the screen and opens the profile tab", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await adminLogin(page);
  await page.getByRole("button", { name: "My profile", exact: true }).click();
  await expect(page.getByLabel("Profile full name")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/admin-profile-mobile.png",
    fullPage: true,
  });
});
