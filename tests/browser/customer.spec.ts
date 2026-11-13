import { test, expect } from "@playwright/test";
test("database-driven location selection persists through navigation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /DISCOVERING IN/ }).click();
  await page
    .locator(".location-options button")
    .filter({ hasText: "India" })
    .first()
    .click();
  await page
    .locator(".location-options button")
    .filter({ hasText: "Kerala" })
    .first()
    .click();
  await page
    .locator(".location-options button")
    .filter({ hasText: "Kannur" })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: /DISCOVERING IN Kannur/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Offers", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Find your next good deal" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /DISCOVERING IN Kannur/ }),
  ).toBeVisible();
});
test("registration and list interactions persist in the real API", async ({
  page,
  request,
}) => {
  const email = `browser-${Date.now()}@example.invalid`,
    password = "browser-test-only-password-539!";
  let csrf = "";
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page
      .getByRole("button", { name: "New here? Create an account" })
      .click();
    await page.getByLabel("Your name").fill("TEST ONLY Browser");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "TEST", exact: true }),
    ).toBeVisible();
    await page.goto("/lists");
    await page
      .getByPlaceholder("Name your new list")
      .fill("TEST ONLY Weekly list");
    await page.getByRole("button", { name: "Create list" }).click();
    await expect(
      page.getByRole("heading", { name: "TEST ONLY Weekly list" }),
    ).toBeVisible();
    await page.getByPlaceholder("Add an item").fill("Milk");
    await page
      .locator("form")
      .filter({ has: page.getByPlaceholder("Add an item") })
      .getByRole("button")
      .click();
    await expect(
      page.locator(".list-item").filter({ hasText: "Milk" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Toggle purchased" }).click();
    await expect(page.locator(".list-item .struck")).toContainText("Milk");
  } finally {
    const login = await request.post(
      "http://localhost:4000/api/v1/auth/login",
      {
        headers: { Origin: "http://localhost:3000" },
        data: { email, password },
      },
    );
    if (login.ok()) {
      csrf = (await login.json()).csrf;
      await request.delete("http://localhost:4000/api/v1/me", {
        headers: { Origin: "http://localhost:3000", "X-CSRF-Token": csrf },
        data: { password },
      });
    }
  }
});
for (const width of [320, 390, 768, 1440])
  test(`layout stays within ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Good finds. Closer to home." }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
