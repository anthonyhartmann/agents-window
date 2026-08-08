# Plan S - Step 4: Drastically Improve Test Coverage

This document outlines **Step 4** of the S-tier roadmap. The goal is to drastically improve test coverage across the application by implementing missing tests outlined in the original S-tier plan, along with any other beneficial tests you can identify.

---

## 1. Unit & Integration Tests (Vitest)

We need exhaustive unit and integration test coverage for our core functionalities.

### A. Implement Missing Test Coverage
*   **`src/providers/Stream.tsx`**: Add coverage for session resume, query-state parameter reading, initial mount state, and message loading.
*   **`src/hooks/useClineStream.ts`**: Implement tests for:
    *   Accumulating multiple concurrent text delta chunks correctly.
    *   Buffering tool call arguments across streaming chunks without loss.
    *   Emitting clean error states and terminating loading status on stream rejection.
    *   Automatically calling `AbortController.abort()` on component unmount.
*   **`src/lib/cline/session-reader.ts`**: Implement tests for:
    *   Resolving the provider default settings cleanly when a recent session is present.
    *   Safely falling back to `providers.json` when sessions directories do not exist.
    *   Gracefully handling malformed manifest JSON files without throwing fatal errors.
*   **`src/app/api/chat/stream/route.ts`**: Add route integration tests to cover response headers, aborted streaming signals, and socket cleanup.
*   **Sidebar Selection & Thread Switching**: Add integration tests covering sidebar clicks, query state updates, and proper unmount memory leak prevention.

### B. Additional Tests
*   Identify any other critical areas of the codebase lacking coverage and implement appropriate unit or integration tests.

---

## 2. End-to-End Tests (Playwright)

Implement the following End-to-End tests in `tests/chat-e2e.spec.ts`.

*   **Case 1: Thread History & Sidebar Selection**
    *   Verify that opening `/` loads the history list.
    *   Verify that it correctly highlights the active thread parameter from the URL.
*   **Case 2: SSE Chat Streaming**
    *   Verify that submitting a prompt initiates the SSE request.
    *   Verify that the main chat bubble list dynamically updates as chunks arrive.
*   **Case 3: ErrorBoundary Crash**
    *   Verify that a component error triggers the standard `ErrorBoundary` rendering fallback.
    *   Ensure the fallback presents a clear reload button and avoids standard browser lockups.

*(Note: The previously planned Case 4 for File Upload & Base64 Serialization has been intentionally skipped as the app does not support file uploads at this time.)*

---

## 3. Strict Guidelines for AI Agents

1.  **Test-Driven Development (TDD):** If modifying any implementation code to make these tests pass, strictly follow TDD.
2.  **Meta-Testing Protocol:** For all new test suites, inject controlled sabotage (e.g., breaking the target component intentionally). Verify the test *fails*, then restore the code and verify the test *passes*. This prevents false positives.
