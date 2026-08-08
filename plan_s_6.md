# Plan S - Step 6: Client-Side Crash Handling & Error Boundary E2E

This document details **Step 6** of the S-tier roadmap: implementing a Playwright
E2E test suite to verify that client-side rendering crashes trigger the standard
`ErrorBoundary` fallback UI correctly, preventing browser lockups.

---

## 1. Development Work

To facilitate triggering a controlled, synchronous React crash during an E2E
test, we can add an optional debugging parameter or button to our UI under test.
For example, in `src/components/thread/index.tsx` or similar component:

```tsx
// Inside component
{process.env.NODE_ENV === "development" && (
  <button
    data-testid="force-crash-button"
    onClick={() => {
      throw new Error("Triggered synchronous component crash");
    }}
    className="hidden"
  >
    Crash App
  </button>
)}
```

---

## 2. Testing Work

We will append the Error Boundary crash test cases to the E2E test file
`tests/chat-e2e.spec.ts`.

### Create or extend E2E test file (`tests/chat-e2e.spec.ts`)

```typescript
import { test, expect } from "@playwright/test";

test.describe("Error Boundary E2E Crash Handling", () => {
  test("catching a client rendering crash renders fallback UI with retry", async ({ page }) => {
    // 1. Arrange: Navigate to chat homepage
    await page.goto("/");

    // Locate the crash button (ensure server is run in development mode)
    const crashButton = page.locator('[data-testid="force-crash-button"]');
    await expect(crashButton).toBeAttached();

    // 2. Act: Click crash button to force a synchronous React exception
    // We expect the browser console to report an error, so we temporarily
    // bypass standard console error failure assertions if any exist.
    await crashButton.click({ force: true });

    // 3. Assert: Verify the ErrorFallback component is displayed
    const errorHeading = page.locator("h1:has-text('Something went wrong')");
    await expect(errorHeading).toBeVisible();

    const errorDetails = page.locator("pre");
    await expect(errorDetails).toBeVisible();
    await expect(errorDetails).toContainText("Triggered synchronous component crash");

    // 4. Assert: Try Again button exists and can reload the application
    const retryBtn = page.locator('button:has-text("Try Again")');
    await expect(retryBtn).toBeVisible();
    await retryBtn.click();

    // Verify it navigates back to a clean state
    await expect(errorHeading).toBeHidden();
  });
});
```

---

## 3. Verification & Meta-Testing

To complete this step, run the following verification steps:

### A. Run Integration Test
Start the local server and execute the Playwright test suite:
```bash
pnpm exec playwright test tests/chat-e2e.spec.ts -g "Error Boundary"
```

### B. Meta-Testing Sabotage Check
We must verify our E2E tests are robust and catch ErrorBoundary failures:
1. Open the layout wrap file (`src/app/layout.tsx`).
2. Inject a sabotage: Temporarily comment out or delete the `<ErrorBoundary>`
   wrapper tag so that errors bubble up globally without being caught.
3. Run the Playwright test suite command again.
4. **Confirm Failure**: Verify that the integration test fails because the
   `Something went wrong` fallback layout is never displayed, leading to a
   blank white screen or browser crash.
5. Revert the sabotage and confirm the test suite passes cleanly again.
