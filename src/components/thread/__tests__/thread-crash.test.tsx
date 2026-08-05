// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React from "react";

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

// Simulate real state changes
let currentMessages: { type: string; content: string }[] = [];
let currentThreadId: string | null = null;
let currentIsLoading = false;

vi.mock("@/providers/Stream", () => ({
  useStreamContext: () => ({
    get messages() { return currentMessages; },
    get isLoading() { return currentIsLoading; },
    get error() { return null; },
    get threadId() { return currentThreadId; },
    submit: vi.fn(),
  }),
  StreamProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("nuqs", () => ({
  useQueryState: () => [null, vi.fn()],
  parseAsBoolean: { withDefault: () => ({}) },
}));

vi.mock("@/hooks/useMediaQuery", () => ({ useMediaQuery: () => true }));

vi.mock("@/hooks/use-file-upload", () => ({
  useFileUpload: () => ({
    contentBlocks: [], setContentBlocks: vi.fn(), handleFileUpload: vi.fn(),
    dropRef: { current: null }, removeBlock: vi.fn(), resetBlocks: vi.fn(),
    dragOver: false, handlePaste: vi.fn(),
  }),
}));

vi.mock("@/components/thread/artifact", () => ({
  useArtifactOpen: () => [false, vi.fn()],
  useArtifactContext: () => [{} as Record<string, unknown>, vi.fn()],
  ArtifactContent: () => null, ArtifactTitle: () => null, useArtifact: () => ({}),
}));

vi.mock("@/components/thread/history", () => ({
  default: () => <div data-testid="thread-history">History</div>,
}));

vi.mock("@/components/thread/messages/ai", () => ({
  AssistantMessage: () => <div data-testid="ai-msg">AI</div>,
  AssistantMessageLoading: () => <div data-testid="ai-loading">Loading</div>,
}));

vi.mock("@/components/thread/messages/human", () => ({
  HumanMessage: () => <div data-testid="human-msg">Human</div>,
}));

import { Thread } from "@/components/thread/index";

describe("Thread crash regression", () => {
  beforeEach(() => {
    currentMessages = [];
    currentThreadId = null;
    currentIsLoading = false;
  });

  it("renders without crash on initial load", () => {
    expect(() => render(<Thread />)).not.toThrow();
  });

  it("renders messages when they exist", () => {
    currentMessages = [
      { type: "human", content: "hello" },
      { type: "ai", content: "hi there" },
    ];
    render(<Thread />);
    expect(screen.getAllByTestId("human-msg")).toHaveLength(1);
    expect(screen.getAllByTestId("ai-msg")).toHaveLength(1);
  });

  it("renders loading state without crash", () => {
    currentIsLoading = true;
    currentMessages = [{ type: "human", content: "hello" }];
    expect(() => render(<Thread />)).not.toThrow();
  });

  it("handles empty messages gracefully", () => {
    currentMessages = [];
    expect(() => render(<Thread />)).not.toThrow();
  });
});
