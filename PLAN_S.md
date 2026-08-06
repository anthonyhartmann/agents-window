# Implementation Plan: [S] Components (Immediate Needs)

This document provides a highly detailed, file-by-file implementation plan for the **[S] (Immediate Needs)** tier of the roadmap. These components aim to solve frontend error visibility, streaming network visibility, and sandbox browser stability issues, enabling cheap/free models to develop at blazing speeds.

---

## 1. Client-Side Debug Interceptor & Error Boundary

### Goal
Allow the developer agent to instantly see why a client-side component crashed, what the exact React component trace was, and what standard query/URL states were active during the crash.

### Files Involved
- `src/providers/ErrorBoundary.tsx` *(New File)*
- `src/app/layout.tsx` *(Modified File)*
- `src/app/api/debug/dump-error/route.ts` *(New File)*
- `.agents-window-debug.json` *(Generated File)*

### Technical Detail & Code Structures

#### A. The Next.js API Route (`src/app/api/debug/dump-error/route.ts`)
This is a secure, local-only API route that writes incoming client-side errors directly to the workspace root.

```typescript
import { NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function POST(request: Request) {
  // Only enable in development to prevent filesystem write vulnerabilities in production
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Only available in development" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const filePath = join(process.cwd(), ".agents-window-debug.json");

    const dumpData = {
      timestamp: new Date().toISOString(),
      type: body.type || "runtime_error",
      message: body.message || "Unknown error",
      stack: body.stack || "",
      componentStack: body.componentStack || "",
      context: {
        url: body.url || "",
        threadId: body.threadId || null,
        chatHistoryOpen: body.chatHistoryOpen || false,
        showThinking: body.showThinking || true,
      },
      consoleLogs: body.consoleLogs || []
    };

    await writeFile(filePath, JSON.stringify(dumpData, null, 2), "utf-8");
    return NextResponse.json({ success: true, path: filePath });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Failed to dump error: " + msg }, { status: 500 });
  }
}
```

#### B. The Error Boundary Component (`src/providers/ErrorBoundary.tsx`)
A classic React Class component that captures unhandled UI exceptions, gathers state, and fires them to the server-side dump.

```tsx
"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  private consoleErrorBuffer: string[] = [];

  constructor(props: Props) {
    super(props);
    if (typeof window !== "undefined") {
      // Intercept and buffer console.error calls in development
      const originalConsoleError = console.error;
      console.error = (...args: any[]) => {
        const formatted = args.map(arg => typeof arg === "object" ? JSON.stringify(arg) : String(arg)).join(" ");
        this.consoleErrorBuffer.push(formatted);
        if (this.consoleErrorBuffer.length > 20) this.consoleErrorBuffer.shift();
        originalConsoleError.apply(console, args);
      };
    }
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);

    // Capture standard query/state contexts from search params
    let threadId = null;
    let chatHistoryOpen = false;
    let showThinking = true;
    let url = "";

    if (typeof window !== "undefined") {
      url = window.location.href;
      const params = new URLSearchParams(window.location.search);
      threadId = params.get("threadId");
      chatHistoryOpen = params.get("chatHistoryOpen") === "true";
      showThinking = params.get("showThinking") !== "false";
    }

    // Fire diagnostics dump asynchronously
    fetch("/api/debug/dump-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "rendering_crash",
        message: error.message,
        stack: error.stack || "",
        componentStack: errorInfo.componentStack || "",
        url,
        threadId,
        chatHistoryOpen,
        showThinking,
        consoleLogs: this.consoleErrorBuffer
      })
    }).catch(err => {
      console.warn("Failed to transmit error boundary dump:", err);
    });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-red-50 text-red-900 font-sans">
          <div className="max-w-2xl w-full bg-white border border-red-200 rounded-xl p-8 shadow-md">
            <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
            <p className="text-sm text-red-700 mb-6">
              A critical rendering crash has occurred. The crash details have been dumped to <code>.agents-window-debug.json</code> in the workspace.
            </p>
            <pre className="p-4 bg-red-100 rounded-lg text-xs overflow-x-auto border border-red-200 mb-6 max-h-60">
              {this.state.error?.stack || this.state.error?.message}
            </pre>
            <button
              onClick={() => {
                if (typeof window !== "undefined") window.location.href = "/";
              }}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg shadow-sm transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.children;
  }
}
```

#### C. Integration in `src/app/layout.tsx`
Import and wrap the entire application within the root layout:

```tsx
import { ErrorBoundary } from "@/providers/ErrorBoundary";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}
```

---

## 2. Network Traffic Inspector & Logging Middleware

### Goal
Provide complete visibility into streaming connection status, payload contents, and headers. If the stream disconnects unexpectedly or throws an error, the agent should find the exact reason logged on disk immediately.

### Files Involved
- `src/hooks/useClineStream.ts` *(Modified File)*
- `src/app/api/debug/dump-network/route.ts` *(New File)*
- `.agents-window-network.json` *(Generated File)*

### Technical Detail & Code Structures

#### A. Network Logger Endpoint (`src/app/api/debug/dump-network/route.ts`)
Another local-only endpoint mapping network interactions to disk.

```typescript
import { NextResponse } from "next/server";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Only available in development" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const filePath = join(process.cwd(), ".agents-window-network.json");

    // Read previous network logs to maintain a rolling queue of the last 10 requests
    let history: any[] = [];
    try {
      const raw = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      history = Array.isArray(parsed) ? parsed : [];
    } catch {
      // file doesn't exist yet
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      url: body.url,
      method: body.method,
      requestPayload: body.requestPayload,
      responseStatus: body.responseStatus,
      error: body.error || null,
      eventsStreamed: body.eventsStreamed || []
    };

    history.unshift(logEntry);
    if (history.length > 10) history.pop();

    await writeFile(filePath, JSON.stringify(history, null, 2), "utf-8");
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Failed to write network log: " + msg }, { status: 500 });
  }
}
```

#### B. Streaming Hook Logging Interception (`src/hooks/useClineStream.ts`)
Modify the `sendMessage` function inside the hook to tap into SSE message receipt and record network performance and transaction data.

```typescript
// Add state to buffer incoming events for network trace logging
const incomingEventsBuffer: any[] = [];

// Within `sendMessage` inside `useClineStream.ts`:
const logNetworkDetails = async (status: number, errMessage?: string) => {
  fetch("/api/debug/dump-network", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "/api/chat/stream",
      method: "POST",
      requestPayload: { message: text, threadId: activeThreadId },
      responseStatus: status,
      error: errMessage,
      eventsStreamed: incomingEventsBuffer
    })
  }).catch(() => {});
};

// When processing streaming text inside useClineStream's fetch block:
const parser = createParser({
  onEvent: (msg: EventSourceMessage) => {
    const ev = parseEventSourceMessage(msg);
    if (ev) {
      // Log individual stream event metadata
      incomingEventsBuffer.push({
        event: ev.event,
        type: ev.data.type || "unknown",
        contentType: ev.data.contentType || null,
        toolName: ev.data.toolName || null,
        error: ev.data.error || null,
        timestamp: new Date().toISOString()
      });
      setState((prev) => processEvent(ev, prev));
    }
  },
});
```

---

## 3. Stabilization of Sandbox / Browser Crashes

### Goal
Ensure that browser automation libraries (Playwright / Puppeteer) can launch correctly inside restricted container sandboxes without memory depletion (`shm` exhaustion) or sandbox execution errors.

### Files Involved
- Playwright configurations or script scripts created by the developer.
- `.clinerules` *(Modified File)*

### Technical Detail & Code Structures

#### A. Playwright/Puppeteer Launch Standard Integration
When configuring browser instances inside custom automation scripts or when recommending script changes, ensure the exact browser arguments are added:

```typescript
import { chromium } from "@playwright/test";

// Unified launch settings recommended for Docker environments and sandboxed runners:
const browser = await chromium.launch({
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage", // Uses /tmp instead of /dev/shm to prevent out-of-memory crashes
    "--disable-gpu", // Speeds up headless execution, prevents GPU driver crashes
    "--disable-software-rasterizer"
  ]
});
```

#### B. Instructions inside `.clinerules`
Add explicit developer rules so that cheap or headless agents automatically configure and test with the correct headless browser parameters.

```markdown
# Headless Browser Verification and Stabilization Rules
When writing or executing Playwright/Puppeteer verification scripts, always apply the following options:
1. Always add the arguments: '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'.
2. If tests fail with unhandled exits or memory exhaustion, verify that the environment does not have shared-memory bottlenecks.
3. Always verify client-side behavior by reading from `.agents-window-debug.json` or `.agents-window-network.json` if browser execution crashes.
```

---

## 4. Plan Validation Steps

### Test 1: Verification of UI Crash Diagnostics
1. Temporarily insert a throw inside `src/components/thread/index.tsx` render function (e.g., `throw new Error("Simulated UI crash");`).
2. Visit `/` in a browser or trigger page load.
3. Verify that the application fails gracefully to the red error boundary screen.
4. Verify that `.agents-window-debug.json` is generated in the root directory and contains the exact stack trace and simulated component tree crash trace.

### Test 2: Verification of Stream Network Inspector
1. Send a standard message in the chat input.
2. Let the stream run for a few tokens, then inspect the root directory for `.agents-window-network.json`.
3. Confirm that it holds an array with the exact request arguments, SSE events chunk summary, and exit headers of the connection.

### Test 3: Verification of Headless Launch Scripting
1. Run a headless verification script with the strict arguments.
2. Ensure that it exits successfully with no memory drops or browser process termination errors.
