# Plan S - Step 1: Client-Side Fallback & `react-error-boundary`

This document details **Step 1** of the S-tier roadmap: integrating standard,
trusted client-side fallback rendering using the `react-error-boundary` package.

---

## 1. Development Work

### A. Dependency Installation
Run the following package manager command:
```bash
pnpm install react-error-boundary
```

### B. Create custom wrapper (`src/providers/ErrorBoundary.tsx`)
Create this new React client component to handle component fallback styling.

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

### C. Wrap Next.js layout (`src/app/layout.tsx`)
Wrap the application children in `RootLayout`:

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

## 2. Testing Work

We will write a unit test to verify that the `ErrorBoundary` correctly catches and
displays thrown component exceptions.

### Create test file (`src/providers/__tests__/ErrorBoundary.test.tsx`)
```tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ErrorBoundary } from "../ErrorBoundary";

const BuggyComponent = () => {
  throw new Error("Simulated component failure");
};

describe("ErrorBoundary", () => {
  it("renders children when no error is thrown", () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">Success child</div>
      </ErrorBoundary>
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("renders ErrorFallback when an error is caught", () => {
    // Disable console.error logging temporarily during error catcher tests
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <BuggyComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText(/Simulated component failure/)).toBeInTheDocument();

    spy.mockRestore();
  });
});
```

---

## 3. Verification & Meta-Testing

To complete this step, run the following verification steps:

### A. Run Test Suite
Run the test runner to confirm the new unit tests pass:
```bash
pnpm test src/providers/__tests__/ErrorBoundary.test.tsx
```

### B. Meta-Testing Sabotage Check
We must verify our test setup is robust and doesn't return a false positive:
1. Open `src/providers/ErrorBoundary.tsx`.
2. Sabotage the code by bypassing the fallback component (e.g. modify
   `ErrorBoundary` to return `{children}` without `ReactErrorBoundary`).
3. Run the test suite command again.
4. **Confirm Failure**: Verify that the unit test fails because the error fallback
   is not rendered. If it still passes, the test is invalid.
5. Revert the sabotage and confirm the test suite passes cleanly again.
