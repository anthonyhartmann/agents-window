import { test, expect } from "@playwright/test";

test.describe("Sandbox and Tracing Stability", () => {
  test("loads main app home page successfully and gathers logs", async ({ page }) => {
    // Navigate to the server root
    await page.goto("http://localhost:3000");

    // Verify main shell elements are present using strict-safe selectors
    const title = page.getByRole("heading", { name: "Agent Chat" });
    await expect(title).toBeVisible();

    // Verify browser is responsive, and input textarea is visible
    const inputArea = page.locator('textarea[placeholder="Type your message..."]');
    await expect(inputArea).toBeVisible();
  });
});
