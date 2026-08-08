# Implementation Plan: [S] Components (Immediate Needs)

This document outlines a revised, **zero-maintenance / minimal-code**
implementation plan for the **[S] (Immediate Needs)** tier of the roadmap,
complemented by a rigorous **Test-Driven Development (TDD) blueprint**, a **Meta-
Testing setup**, an **Exhaustive Coverage Map**, and **Permanent Production Diagnostics**.

---

## 1. Client-Side Rendering Crashes via `react-error-boundary` (COMPLETED)

### The Minimalist Approach

Rather than writing a custom React Class Component with global overrides of
`console.error` and console buffers, we integrate the popular, highly tested
`react-error-boundary` library. It handles fallback layout rendering safely and
provides a clean hook interface.

### Files Involved

- `src/providers/ErrorBoundary.tsx` _(New File - Completed)_
- `src/app/layout.tsx` _(Modified File - Completed)_

### Technical Implementation

We create a lightweight wrapper in `src/providers/ErrorBoundary.tsx` that
leverages `react-error-boundary`:

```tsx
"use client";

import React, { ReactNode } from "react";
import { ErrorBoundary as ReactErrorBoundary } from "react-error-boundary";

function ErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-red-50 p-6 font-sans text-red-900">
      <div className="w-full max-w-2xl rounded-xl border border-red-200 bg-white p-8 shadow-md">
        <h1 className="mb-4 text-2xl font-bold">Something went wrong</h1>
        <p className="mb-6 text-sm text-red-700">
          A client-side rendering crash occurred.
        </p>
        <pre className="mb-6 max-h-60 overflow-x-auto rounded-lg border border-red-200 bg-red-100 p-4 text-xs">
          {error.stack || error.message}
        </pre>
        <button
          onClick={resetErrorBoundary}
          className="rounded-lg bg-red-600 px-4 py-2 font-medium text-white shadow-sm transition-colors hover:bg-red-700"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}

export function ErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ReactErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => {
        if (typeof window !== "undefined") window.location.href = "/";
      }}
    >
      {children}
    </ReactErrorBoundary>
  );
}
```

_This requires executing `pnpm install react-error-boundary` as a lightweight,
single-dependency addition to the codebase._

---

## 2. Leveraging Playwright Tracing for Instant Debugging & Network Logs

### The Zero-Custom-Code Insight

When running Cline or any developer agent inside a browser sandbox, **the agent
doesn't need custom filesystem endpoints or API routes to inspect errors and
network traffic**. Writing `/api/debug` logs requires maintaining custom code,
handling security implications (directory traversal risks on filesystems), and
manually parsing raw custom files.

Instead, we leverage **Playwright's built-in Tracing API** which is already
present in `devDependencies` via `@playwright/test`.

Playwright Tracing automatically captures:

1. **Full Network Logs:** Fetch requests, API request/response payloads,
   headers, latency, and full chunk streams (like `/api/chat/stream`).
2. **Console Logs:** `console.log`, `console.error`, and `console.warn` outputs
   are fully captured and timestamped.
3. **Screenshots & DOM Snapshots:** A visual step-by-step history of every
   interaction and rendering change.

### How to use Playwright Tracing

Configure your local agent or automation suite to run tests with tracing
enabled in `playwright.config.ts`:

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  use: {
    // Collect trace for all tests. This produces a single, portable zip file
    trace: "on",
    screenshot: "on",
    video: "on-first-retry",
  },
});
```

### Unpacking Traces Agentically

If the agent runs into a failing assertion or crash:

1. The agent executes the test (e.g., `pnpm exec playwright test`).
2. Playwright saves a trace file (e.g., `test-results/my-test/trace.zip`).
3. The agent can programmatically unzip and read the built-in trace JSON
   structure (`trace.playwright.json`) or use the built-in trace viewer:
   ```bash
   pnpm exec playwright show-trace test-results/my-test/trace.zip
   ```
4. This gives the agent a precise, structured overview of all `fetch`
   responses, headers, console errors, and DOM screenshots **without writing a
   single line of custom backend routing code**.

---

## 3. Stabilization of Headless Sandbox & Chrome Browser Crashes

To prevent Chrome browser crashes in restricted, headless environments (such as
Docker, Cline virtualized sandboxes, or remote execution layers), we override
the default browser launching args to use optimized, sandboxed settings.

### Playwright / Puppeteer Configuration

Add these exact arguments to the Chromium browser launching block to bypass
memory constraints and GPU driver crashes:

```typescript
import { chromium } from "@playwright/test";

const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox", // Disable Chromium namespace sandbox in Docker
    "--disable-setuid-sandbox", // Disable user namespace sandbox for setuid binaries
    "--disable-dev-shm-usage", // Prevent memory exhaustion crashes by writing to /tmp instead of /dev/shm
    "--disable-gpu", // Bypass GPU hardware acceleration driver crashes
    "--disable-software-rasterizer", // Speeds up headless execution on lightweight CPUs
  ],
});
```

---

## 4. Test Integration & "Meta-Testing" After Every Step

To ensure our tests are fully resilient and avoid "false positives" (tests
that pass even when the system is fundamentally broken), we mandate a strict
**Meta-Testing** protocol after completing any implementation step.

### Meta-Testing Protocol

For any test suite written for an [S] component:

1. **Verify Pass:** Run the test suite on clean code and confirm it exits with
   success (0).
2. **Inject Controlled Sabotage:** Purposefully introduce a logical error or
   runtime bug in the implementation code.
   - _Example for Error Boundary:_ Temporarily remove the ErrorBoundary wrap from
     `layout.tsx` or force it to swallow errors silently.
   - _Example for Tracing:_ Temporarily mock network requests to completely bypass
     the trace settings or corrupt the output trace directory.
3. **Verify Expected Failure:** Run the test suite again. The test **must fail**
   and report the exact failure mode. If the test still passes, the test itself
   is broken (a false positive) and must be rewritten.
4. **Revert and Restore:** Undo the sabotage and confirm the test suite passes
   cleanly once more.

---

## 5. Agent Guidelines for Test-Driven Development (TDD)

When executing development tasks using our setup, AI agents must adhere to the
following strict TDD sequence:

1. **Write the Test First:** Before touching any source implementation file,
   create a failing test file (e.g., `src/.../__tests__/my-feature.test.tsx`)
   covering the required happy path and edge cases.
2. **Verify Failure:** Run the test runner (e.g., `pnpm test`). Ensure the new test
   fails specifically due to the missing implementation.
3. **Write Minimal Source Code:** Implement only the code necessary to make the
   test pass.
4. **Refactor & Format:** Clean up code formatting and imports, and run
   `pnpm format:check` and `pnpm lint`.
5. **Perform Meta-Testing:** Sabotage the code temporarily to guarantee the test
   suite is robust, then restore.

---

## 6. Exhaustive Testing & Feature Coverage Map

The current test suite is highly sparse. We aim for full coverage across all
functionality. Below is the list of missing test coverage and the detailed Unit
and E2E test cases we plan to implement to achieve exhaustive test assurance.

### A. Missing Test Functionality

1. **`src/providers/Stream.tsx`**: Currently untested. No coverage for session
   resume, query-state parameter reading, initial mount state, or message loading.
2. **`src/hooks/useClineStream.ts`**: Untested. No tests for EventSource SSE
   parsing, parser delta accumulation, tool-call chunk state mapping, or abort
   controller cleanup.
3. **`src/lib/cline/session-reader.ts`**: Lacks rigorous tests for path
   resolution, fallback to settings directories, manifest schema mismatches, and
   file listing ordering.
4. **`src/app/api/chat/stream/route.ts`**: No route integration tests. No
   coverage for response headers, aborted streaming signals, or socket cleanup.
5. **Sidebar Selection & Thread Switching**: No end-to-end tests covering sidebar
   clicks, query state updates, and proper unmount memory leak prevention.

### B. Planned Unit & Integration Tests (Vitest)

- `src/hooks/__tests__/useClineStream.test.ts`
  - _Case 1:_ Accumulates multiple concurrent text delta chunks correctly.
  - _Case 2:_ Buffers tool call arguments across streaming chunks without loss.
  - _Case 3:_ Emits clean error states and terminates loading status on stream
    rejection.
  - _Case 4:_ Automatically calls `AbortController.abort()` on component unmount.
- `src/lib/cline/__tests__/session-reader.test.ts`
  - _Case 1:_ Resolves the provider default settings cleanly when a recent
    session is present.
  - _Case 2:_ Safely falls back to `providers.json` when sessions directories do
    not exist.
  - _Case 3:_ Gracefully handles malformed manifest JSON files without throwing
    fatal errors.

### C. Planned End-to-End Tests (Playwright)

- `tests/chat-e2e.spec.ts`
  - _Case 1:_ Opening `/` loads the history list and correctly highlights the
    active thread parameter from the URL.
  - _Case 2:_ Submitting a prompt initiates the SSE request and updates the main
    chat bubble list dynamically as chunks arrive.
  - _Case 3:_ A component error triggers the standard `ErrorBoundary` rendering
    fallback, presenting a clear reload button and avoiding standard browser
    lockups.
  - _Case 4:_ Uploading a file serializes the attachment to Base64 and appends
    it to the outbound stream API body.

---

## 7. Permanent Production Diagnostics Logging via Winston (IN PROGRESS)

To guarantee high reliability and avoid the security risks and runtime bugs
associated with custom rolling file-writer logic, we leverage **Winston** (the
industry-standard Node.js logger) combined with its robust size-based rotation.

### A. Package Installation (Completed)

Execute standard, production-tested package commands:

```bash
pnpm install winston winston-daily-rotate-file
```

### B. Logger Configuration

We create a highly reliable, unified logger instance at `src/lib/logger.ts`:

```typescript
import winston from "winston";
import "winston-daily-rotate-file";
import path from "path";

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json(),
);

export const logger = winston.createLogger({
  level: "info",
  format: logFormat,
  transports: [
    // Production diagnostics rotate transport configuration
    new winston.transports.DailyRotateFile({
      filename: path.join(
        process.cwd(),
        ".agents-window-diagnostics-%DATE%.log",
      ),
      datePattern: "YYYY-MM-DD",
      maxSize: "5m", // Maximum log file size before rotating
      maxFiles: "3", // Retain a maximum of 3 rotated backup log files
      zippedArchive: true, // Compress older backup logs
    }),
  ],
});
```

### C. Diagnostics Schema & Logging Logic

Every logged event conforms strictly to a structured JSON schema:

```typescript
interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  threadId: string | null;
  category: "API_ROUTE" | "SSE_STREAM" | "CLIENT_UI" | "CLINE_SDK";
  message: string;
  metadata?: Record<string, unknown>;
}
```

Usage inside Next.js API Routes and SSE stream handlers:

```typescript
import { logger } from "@/lib/logger";

logger.error("SSE stream serialization failed", {
  threadId: "1785255661814_gtekl",
  category: "SSE_STREAM",
  metadata: { statusCode: 500, error: err.message },
});
```

### D. Agent Pinpoint Diagnostics Guidelines

AI developer agents looking to pinpoint real fails in production must:

1. Locate the rotated diagnostics logs (matching `.agents-window-diagnostics-*.log`).
2. Search and parse the JSON line objects.
3. Filter by the specific thread ID, category, or level `error`.
4. Pinpoint the exact root cause from the parsed JSON metadata fields.
