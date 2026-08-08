import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ErrorBoundary } from "../ErrorBoundary";
import "@testing-library/jest-dom";

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
