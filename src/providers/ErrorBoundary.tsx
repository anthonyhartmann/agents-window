"use client";

import React, { ReactNode } from "react";
import { ErrorBoundary as ReactErrorBoundary } from "react-error-boundary";

function ErrorFallback({ error, resetErrorBoundary }: { error: any; resetErrorBoundary: () => void }) {
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
