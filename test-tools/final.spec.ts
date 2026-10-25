import { deflateSync } from "node:zlib";
import { test, expect } from "@playwright/test";

function samplePng() {
  const chunk = (name: string, data: Buffer) => {
    const type = Buffer.from(name),
      payload = Buffer.concat([type, data]);
    let crc = 0xffffffff;
    for (const byte of payload) {
      crc ^= byte;
      for (let b = 0; b < 8; b++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const length = Buffer.alloc(4),
      checksum = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, payload, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.from([0, 23, 75, 63]))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("customer request → owner approval → simulated payment in separate browser sessions", async ({
  browser,
}) => {
  const customer = await browser.newContext(),
    owner = await browser.newContext();
  const page = await customer.newPage(),
    admin = await owner.newPage();
  await page.goto("/");
  await expect(
    page.getByText("LOCAL TEST ONLY", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.getByLabel("Login email", { exact: true }).fill("guest@wh.test");
  await page
    .getByLabel("Login password", { exact: true })
    .fill("WhTestOnly2026!");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(
    page.getByText("Phone verified.", { exact: false }),
  ).toBeVisible();
  const checkIn = new Date(Date.now() + 8 * 86400000)
      .toISOString()
      .slice(0, 10),
    checkOut = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
  await page.getByLabel("Check-in", { exact: true }).fill(checkIn);
  await page.getByLabel("Check-out", { exact: true }).fill(checkOut);
  await page
    .getByRole("button", { name: "Check availability", exact: true })
    .click();
  await expect(page.getByRole("status")).not.toContainText("error");
  await page
    .getByRole("button", { name: "Request stay", exact: true })
    .first()
    .click();
  await expect(page.getByRole("status")).toContainText("PENDING_APPROVAL");
  await admin.goto("/admin");
  await admin.getByLabel("Admin email").fill("admin@wh.test");
  await admin.getByLabel("Admin password").fill("WhTestOnly2026!");
  await admin
    .getByRole("button", { name: "Email sign in", exact: true })
    .click();
  await expect(
    admin.getByRole("button", { name: "accept", exact: true }),
  ).toBeVisible();
  await admin.getByRole("button", { name: "accept", exact: true }).click();
  await expect(
    admin.getByText("AWAITING_PAYMENT", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Refresh profile", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Simulate payment — no money", exact: true })
    .click();
  await expect(page.getByText("CONFIRMED", { exact: true })).toBeVisible();
  await admin
    .getByRole("button", { name: "Load / refresh dashboard", exact: true })
    .click();
  await admin.getByRole("button", { name: "Payments", exact: true }).click();
  await expect(admin.getByText(/SIMULATED ·/)).toBeVisible();

  await admin.getByRole("button", { name: "Rooms", exact: true }).click();
  await admin
    .getByLabel("Upload room photo", { exact: true })
    .first()
    .setInputFiles({
      name: "room.png",
      mimeType: "image/png",
      buffer: samplePng(),
    });
  const uploaded = admin.locator("img").first();
  await expect(uploaded).toBeVisible();
  await expect
    .poll(() =>
      uploaded.evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator(".site-header .brand")).toContainText("WN");
  const guestPhoto = page.getByAltText("Deluxe Double").first();
  await expect(guestPhoto).toBeVisible();
  await expect
    .poll(() =>
      guestPhoto.evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
  await customer.close();
  await owner.close();
});

test("admin requires explicit credentials and stays separate from the customer session", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Admin", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.getByLabel("Login email", { exact: true }).fill("guest@wh.test");
  await page
    .getByLabel("Login password", { exact: true })
    .fill("WhTestOnly2026!");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(
    page.getByText("Phone verified.", { exact: false }),
  ).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByLabel("Admin email")).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Load / refresh dashboard", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Google sign in", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Admin email").fill("guest@wh.test");
  await page.getByLabel("Admin password").fill("WhTestOnly2026!");
  await page
    .getByRole("button", { name: "Email sign in", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "does not have administration access",
  );
  await expect(
    page.getByRole("heading", { name: "Booking requests", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Admin email").fill("admin@wh.test");
  await page.getByLabel("Admin password").fill("WhTestOnly2026!");
  await page
    .getByRole("button", { name: "Email sign in", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Booking requests", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Admin password")).toBeVisible();
  await page.goto("/");
  await page.getByRole("button", { name: "My bookings", exact: true }).click();
  await expect(
    page.getByText("Phone verified.", { exact: false }),
  ).toBeVisible();
  await page.goto("/admin");
  await page.getByLabel("Admin email").fill("admin@wh.test");
  await page.getByLabel("Admin password").fill("WhTestOnly2026!");
  await page
    .getByRole("button", { name: "Email sign in", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Booking requests", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Admin password")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Booking requests", exact: true }),
  ).toHaveCount(0);
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`Guest login and signup dialog at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "My account", exact: true }),
    ).toHaveCount(0);
    const login = page.getByRole("button", { name: "Login", exact: true });
    await login.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByLabel("Login email", { exact: true })).toBeFocused();
    await expect(
      page.getByRole("heading", { name: "Welcome back", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Show password", exact: true })
      .click();
    await expect(
      page.getByLabel("Login password", { exact: true }),
    ).toHaveAttribute("type", "text");
    await page.screenshot({ path: testInfo.outputPath("login.png") });
    await page.getByRole("tab", { name: "Sign up", exact: true }).click();
    await page.getByLabel("Login email", { exact: true }).fill("new@wh.test");
    await page
      .getByLabel("Login password", { exact: true })
      .fill("Example123!");
    await page
      .getByLabel("Confirm password", { exact: true })
      .fill("Different123!");
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(dialog.getByRole("status")).toContainText(
      "passwords do not match",
    );
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(login).toBeFocused();
    await page.getByRole("button", { name: "Sign up", exact: true }).click();
    await expect(
      page.getByLabel("Confirm password", { exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Login", exact: true }).click();
    await page
      .getByRole("button", { name: "Forgot password?", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Send reset link", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Login password", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Back to login", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Continue with phone number", exact: true })
      .click();
    await expect(
      page.getByLabel("Phone number", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("SMS code", { exact: true })).toHaveCount(0);
    await page
      .getByRole("button", { name: "Close login", exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("home.png"),
      fullPage: true,
    });
  });
}

test('signup creates a Firebase account and offers required contact verification', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button',{name:'Sign up',exact:true}).click();
  await page.getByLabel('Login email',{exact:true}).fill(`signup-${Date.now()}@wh.test`);
  await page.getByLabel('Login password',{exact:true}).fill('SignupTest2026!');
  await page.getByLabel('Confirm password',{exact:true}).fill('SignupTest2026!');
  await page.getByRole('button',{name:'Create account',exact:true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('heading',{name:'Your WN account',exact:true})).toBeVisible();
  await expect(page.getByText('Email verification required',{exact:true})).toBeVisible();
  await expect(page.getByText('Phone verification required',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Send verification email',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Send verification code',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.getByRole('button',{name:'Login',exact:true})).toBeVisible();
});
