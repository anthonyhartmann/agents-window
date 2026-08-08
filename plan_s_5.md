# Plan S - Step 5: Complete Remaining `PLAN_S.md` Features

This document outlines **Step 5** of the S-tier roadmap. The goal is to ensure all incomplete implementation items and guidelines mentioned in the original `PLAN_S.md` are fully achieved.

---

## 1. Permanent Production Diagnostics Logging via Winston

The original plan stated this was "(IN PROGRESS)". Ensure this is fully complete.

*   **Verify Logger Implementation:** Ensure `src/lib/logger.ts` uses `winston` and `winston-daily-rotate-file` correctly (structured JSON format, size-based rotation, retention of 3 backups).
*   **Winston Diagnostics Test:** Ensure the unit test for Winston logs (e.g., `src/lib/__tests__/logger.test.ts`) is fully functional.
    *   *Critical:* Remember to generate date strings using local timezone parts (e.g., `.getFullYear()`, `.getMonth() + 1`, and `.getDate()`) instead of `.toISOString().split('T')[0]` to align with the local rotation filename suffix.
*   **Instrumentation:** Ensure that Next.js API Routes (like `/api/chat/stream/route.ts`) and SSE stream handlers are properly instrumented to use this logger. Use structured logging with fields: `timestamp`, `level`, `threadId`, `category`, `message`, and `metadata`.

## 2. Playwright Tracing Integration (Zero-Custom-Code Insight)

The original plan emphasized leveraging built-in tools for debugging instead of writing custom endpoints.

*   **Verify Playwright Configuration:** Check `playwright.config.ts` to ensure tracing is properly enabled (`trace: 'on'`).
*   **Documentation Check:** Make sure instructions exist for unpacking traces agentically (e.g., how to use `show-trace` or read `trace.playwright.json`).

## 3. Stabilization of Headless Sandbox

*   **Verify Sandbox Configuration:** Ensure the Playwright config includes the required launch arguments (`--no-sandbox`, `--disable-setuid-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`, `--disable-software-rasterizer`) to prevent browser crashes in headless sandboxed environments.

## 4. Other Remaining Items

*   Review the original `PLAN_S.md` in its entirety. If there are *any* other unfinished features, integrations, or bug fixes required by that document that have not yet been implemented, implement them now.

## 5. Strict Guidelines for AI Agents

1.  **Test-Driven Development (TDD):** Any new logic implemented here must have tests written first.
2.  **Meta-Testing Protocol:** For all new tests, inject controlled sabotage. Verify the test *fails*, then restore the code and verify the test *passes*. This prevents false positives.
