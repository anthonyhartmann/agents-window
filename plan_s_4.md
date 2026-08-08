# Plan S - Step 4: E2E Thread History & Sidebar Switching

This document details **Step 4** of the S-tier roadmap: implementing a Playwright
E2E test suite to verify thread history rendering, URL state synchronization, and
sidebar thread switching.

---

## 1. Development Work

No source code modification is strictly needed if the feature is already fully
functional. However, to support robust E2E test targeting without fragile CSS
selectors, ensure key elements have distinct `data-testid` attributes:

- Sidebar thread item: `data-testid="sidebar-thread-item"` or
  `data-testid="thread-link-{id}"`
- Thread title text: `data-testid="thread-title"`
- Active thread indicator/highlight: Ensure active/selected elements can be
  identified via CSS or `data-active="true"`.

---

## 2. Testing Work

We will write the initial test cases of the E2E test suite under a new file
`tests/chat-e2e.spec.ts`.

### Create or extend E2E test file (`tests/chat-e2e.spec.ts`)

```typescript
import { test, expect } from "@playwright/test";

test.describe("Thread History & Sidebar Selection", () => {
  test("loads the thread history list and highlights the active thread", async ({ page }) => {
    // 1. Arrange: Navigate to root with a specific threadId in query state
    const targetThreadId = "test-thread-123";
    await page.goto(`/?threadId=${targetThreadId}`);

    // 2. Act & Assert: Check that the sidebar history list loaded
    const threadItems = page.locator('[data-testid^="thread-link-"]');
    await expect(threadItems.first()).toBeVisible();

    // 3. Assert: Active thread matches the URL parameter and is highlighted
    const activeThread = page.locator(`[data-testid="thread-link-${targetThreadId}"]`);
    await expect(activeThread).toBeVisible();
    await expect(activeThread).toHaveAttribute("data-active", "true");
  });

  test("clicking a thread updates the URL and switches the active panel", async ({ page }) => {
    // 1. Arrange: Open homepage
    await page.goto("/");

    // 2. Act: Click on another thread in the sidebar
    const secondThreadId = "test-thread-456";
    const secondThreadLink = page.locator(`[data-testid="thread-link-${secondThreadId}"]`);
    await expect(secondThreadLink).toBeVisible();
    await secondThreadLink.click();

    // 3. Assert: URL query state parameter is updated correctly
    await expect(page).toHaveURL(new RegExp(`\\?threadId=${secondThreadId}`));

    // 4. Assert: The active thread highlights match the updated query state
    await expect(secondThreadLink).toHaveAttribute("data-active", "true");
  });
});
```

---

## 3. Verification & Meta-Testing

To complete this step, run the following verification steps:

### A. Run Integration Test
Start the local server and execute the Playwright test suite:
```bash
pnpm exec playwright test tests/chat-e2e.spec.ts -g "Thread History"
```

### B. Meta-Testing Sabotage Check
We must verify our E2E tests are robust and detect regressions:
1. Open the sidebar navigation component (e.g.
   `src/components/thread/history/index.tsx`).
2. Inject a sabotage: Temporarily bypass or hardcode the clicked `threadId`
   update, or disable setting `data-active="true"` on the selected link.
3. Run the Playwright test suite command again.
4. **Confirm Failure**: Verify that the integration test fails, either because
   the URL doesn't update or the active highlighting is incorrect, and check the
   generated trace zip.
5. Revert the sabotage and confirm the test suite passes cleanly again.
