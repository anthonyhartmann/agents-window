# Plan S - Step 3: Playwright Tracing & Browser Sandbox Stabilization

This document details **Step 3** of the S-tier roadmap: stabilizing sandbox browser
environments and setting up native Playwright Tracing for automated integration test logging.

---

## 1. Development Work

### A. Override headless browser launch parameters
Ensure standard, non-crashing arguments are set whenever triggering headless
Playwright test environments. Update custom automated test launch files to include:

```typescript
import { chromium } from "@playwright/test";

const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",                  // Required inside Docker containers
    "--disable-setuid-sandbox",       // Prevent permission crashes
    "--disable-dev-shm-usage",        // Use /tmp instead of small /dev/shm partition
    "--disable-gpu",                  // Speeds up virtual rendering
    "--disable-software-rasterizer"   // Prevents software rendering crashes
  ]
});
```

### B. Configure global Playwright tracing (`playwright.config.ts`)
Ensure that Playwright automatically collects trace and screenshot info:

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  use: {
    // Generate portable .zip traces for all tests
    trace: "on",
    screenshot: "on",
    video: "on-first-retry",
  },
});
```

---

## 2. Testing Work

We will write an E2E test verifying that Playwright is stable, can launch in the
sandboxed mode without crashing, and generates structured Trace results for the agent.

### Create E2E test file (`tests/sandbox-smoke.spec.ts`)
```typescript
import { test, expect } from "@playwright/test";

test.describe("Sandbox and Tracing Stability", () => {
  test("loads main app home page successfully and gathers logs", async ({ page }) => {
    // Navigate to the server root
    await page.goto("http://localhost:3000");

    // Verify main shell elements are present
    const title = await page.locator("h1");
    await expect(title).toBeVisible();

    // Verify browser is responsive and doesn't crash
    const newThreadBtn = page.locator('button:has-text("New thread")');
    if (await newThreadBtn.count() > 0) {
      await expect(newThreadBtn).toBeEnabled();
    }
  });
});
```

---

## 3. Verification & Meta-Testing

To complete this step, run the following verification steps:

### A. Run Integration Test
Start the local server and execute the smoke test:
```bash
pnpm exec playwright test tests/sandbox-smoke.spec.ts
```

### B. Verify Trace zip file creation
Confirm that Playwright successfully created the visual zip tracing:
```bash
ls -la test-results/sandbox-smoke-loads-main-app-home-page-successfully-and-gathers-logs/trace.zip
```

### C. Meta-Testing Sabotage Check
We must verify our Playwright testing configuration catches crashes:
1. Temporarily modify the target URL in the test file from `http://localhost:3000`
   to an invalid address (e.g. `http://localhost:9999`).
2. Run the Playwright test suite command again.
3. **Confirm Failure**: Verify that the integration test fails because the server is
   not reachable, and that a corresponding failure trace is successfully generated in the
   `test-results/` directory. If it passes, the test configuration is incorrect.
4. Revert the sabotage and confirm the test suite passes cleanly.
