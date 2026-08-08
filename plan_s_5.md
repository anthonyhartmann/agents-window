# Plan S - Step 5: SSE Chat Streaming & Dynamic Bubble Render E2E

This document details **Step 5** of the S-tier roadmap: implementing a Playwright
E2E test suite to verify prompt submission, Server-Sent Events (SSE) streaming,
and progressive chat UI message bubble rendering.

---

## 1. Development Work

Ensure that input fields and message blocks are easily targeted by E2E tests:

- Prompt input textarea: `data-testid="prompt-input"` or `placeholder="Type a
  message..."`
- Submit button: `data-testid="send-prompt-button"`
- Message bubbles: `data-testid="chat-message-ai"` or
  `data-testid="chat-message-human"`
- Streaming indicator/loading status: `data-testid="streaming-indicator"` or
  disabled state on input during active stream.

---

## 2. Testing Work

We will append the SSE streaming test cases to the E2E test file
`tests/chat-e2e.spec.ts`.

### Create or extend E2E test file (`tests/chat-e2e.spec.ts`)

```typescript
import { test, expect } from "@playwright/test";

test.describe("SSE Chat Streaming & Dynamic Render", () => {
  test("submitting prompt initiates SSE stream and progressively updates UI", async ({ page }) => {
    // 1. Arrange: Navigate to an empty thread
    await page.goto("/?threadId=new-test-thread");

    // Locate prompt input and submit button
    const promptInput = page.locator('[data-testid="prompt-input"]');
    const sendButton = page.locator('[data-testid="send-prompt-button"]');

    // 2. Act: Fill prompt and submit
    const userPrompt = "Hello AI, tell me a quick story.";
    await promptInput.fill(userPrompt);
    await sendButton.click();

    // 3. Assert: Human bubble is rendered immediately
    const humanBubble = page.locator('[data-testid="chat-message-human"]').first();
    await expect(humanBubble).toBeVisible();
    await expect(humanBubble).toContainText(userPrompt);

    // 4. Assert: AI response bubble starts streaming and displays text chunks
    const aiBubble = page.locator('[data-testid="chat-message-ai"]').first();
    await expect(aiBubble).toBeVisible();

    // Wait until the loading indicator is resolved/finished
    const streamingIndicator = page.locator('[data-testid="streaming-indicator"]');
    await expect(streamingIndicator).toBeVisible();
    await expect(streamingIndicator).toBeHidden({ timeout: 15000 });

    // Assert that the full response content is present
    await expect(aiBubble).not.toBeEmpty();
  });
});
```

---

## 3. Verification & Meta-Testing

To complete this step, run the following verification steps:

### A. Run Integration Test
Start the local server and execute the Playwright test suite:
```bash
pnpm exec playwright test tests/chat-e2e.spec.ts -g "SSE Chat Streaming"
```

### B. Meta-Testing Sabotage Check
We must verify our E2E tests are robust and detect stream failures:
1. Open the stream hook file (e.g. `src/hooks/useClineStream.ts`).
2. Inject a sabotage: Temporarily mock the text parser chunk logic to completely
   discard or corrupt the incoming text stream data (e.g., return empty strings
   for text deltas).
3. Run the Playwright test suite command again.
4. **Confirm Failure**: Verify that the integration test fails because the AI
   bubble remains completely empty, and confirm the failure is recorded in the
   trace zip.
5. Revert the sabotage and confirm the test suite passes cleanly again.
