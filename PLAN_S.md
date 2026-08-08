# Implementation Plan: [S] Components (Immediate Needs)

This document outlines a revised, **zero-maintenance / minimal-code**
implementation plan for the **[S] (Immediate Needs)** tier of the roadmap.

Instead of writing and maintaining a large surface area of custom interceptors,
custom Error Boundary classes, custom console buffers, and local `/api/debug/*`
logging endpoints, we **leverage existing, industry-standard, battle-tested
libraries and out-of-the-box browser tracing capabilities**. This minimizes
developer cognitive load, keeps the codebase secure, and reduces technical debt
to practically zero.

---

## 1. Client-Side Rendering Crashes via `react-error-boundary`

### The Minimalist Approach
Rather than writing a custom React Class Component with global overrides of
`console.error` and console buffers, we integrate the popular, highly tested
`react-error-boundary` library. It handles fallback layout rendering safely and
provides a clean hook interface.

### Files Involved
- `src/providers/ErrorBoundary.tsx` *(New File)*
- `src/app/layout.tsx` *(Modified File)*

### Technical Implementation

We create a lightweight wrapper in `src/providers/ErrorBoundary.tsx` that
leverages `react-error-boundary`:

```tsx
"use client";

import React, { ReactNode } from "react";
import { ErrorBoundary as ReactErrorBoundary } from "react-error-boundary";

function ErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-red-50 text-red-900 font-sans">
      <div className="max-w-2xl w-full bg-white border border-red-200 rounded-xl p-8 shadow-md">
        <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
        <p className="text-sm text-red-700 mb-6">
          A client-side rendering crash occurred.
        </p>
        <pre className="p-4 bg-red-100 rounded-lg text-xs overflow-x-auto border border-red-200 mb-6 max-h-60">
          {error.stack || error.message}
        </pre>
        <button
          onClick={resetErrorBoundary}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg shadow-sm transition-colors"
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

*This requires executing `pnpm install react-error-boundary` as a lightweight, single-dependency addition to the codebase.*

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
1. **Full Network Logs:** Fetch requests, API request/response payloads, headers, latency, and full chunk streams (like `/api/chat/stream`).
2. **Console Logs:** `console.log`, `console.error`, and `console.warn` outputs are fully captured and timestamped.
3. **Screenshots & DOM Snapshots:** A visual step-by-step history of every interaction and rendering change.

### How to use Playwright Tracing
Configure your local agent or automation suite to run tests with tracing enabled
in `playwright.config.ts`:

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
3. The agent can programmatically unzip and read the built-in trace JSON structure (`trace.playwright.json`) or use the built-in trace viewer:
   ```bash
   pnpm exec playwright show-trace test-results/my-test/trace.zip
   ```
4. This gives the agent a precise, structured overview of all `fetch` responses, headers, console errors, and DOM screenshots **without writing a single line of custom backend routing code**.

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
    "--no-sandbox",                  // Disable Chromium user namespace sandbox in Docker
    "--disable-setuid-sandbox",       // Disable user namespace sandbox for setuid binaries
    "--disable-dev-shm-usage",        // Prevent memory exhaustion crashes by writing to /tmp instead of /dev/shm
    "--disable-gpu",                  // Bypass GPU hardware acceleration driver crashes
    "--disable-software-rasterizer"   // Speeds up headless execution on lightweight CPUs
  ]
});
```

---

## 4. Summary of Codebase Impact & Footprint

| Category | High-Maintenance Approach | Low-Maintenance Library Approach (Fewer lines of code to maintain!) |
|----------|---------------------------|-------------------------------------------------------------------|
| **Error Fallbacks** | Custom Class component + global overrides + custom window logs wrapper. | `react-error-boundary` standard library. |
| **Error Diagnostics** | Custom `/api/debug/dump-error` route + filesystem writing. | None. Built-in Next.js page layouts + standard Playwright Tracing console captures. |
| **Network Traffic Logs** | Custom `/api/debug/dump-network` route + hook fetch wrappers + chunk logging buffers. | None. Standard browser network trace capture using native Playwright HAR / `.zip` tracing. |
| **Sandbox Execution** | Standard Playwright headless settings. | Playwright launcher configured with `--disable-dev-shm-usage` & `--no-sandbox` overrides. |

Using this updated approach, we achieve a **10x reduction in custom code
scope**, keeping our repository clean, secure, and infinitely easier to maintain
over time.
