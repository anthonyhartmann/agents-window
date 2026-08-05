// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import type { UIMessage } from "@/lib/cline/cline-types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mutable state that the mock hook exposes via getters so each render picks up
// the latest values without needing to re-mock the entire object.
const state = {
  messages: [] as UIMessage[],
  threadId: null as string | null,
  isLoading: false,
  error: null as string | null,
};

const mockSendMessage = vi.fn();
const mockLoadMessages = vi.fn((msgs: UIMessage[], tid: string) => {
  state.messages = msgs;
  state.threadId = tid;
});
const mockClearError = vi.fn(() => {
  state.error = null;
});

vi.mock("@/hooks/useClineStream", () => ({
  useClineStream: () => ({
    get messages() { return state.messages; },
    get isLoading() { return state.isLoading; },
    get error() { return state.error; },
    get threadId() { return state.threadId; },
    sendMessage: mockSendMessage,
    loadMessages: mockLoadMessages,
    clearError: mockClearError,
  }),
}));

// nuqs mock - controllable threadId from the URL
let urlThreadId: string | null = null;
const mockSetThreadId = vi.fn((val: string | null) => {
  urlThreadId = val;
});

vi.mock("nuqs", () => ({
  useQueryState: () => [urlThreadId, mockSetThreadId],
}));

// Stub UI component imports that the provider pulls in (they aren't needed)
vi.mock("@/components/ui/input", () => ({ Input: () => null }));
vi.mock("@/components/ui/button", () => ({ Button: () => null }));
vi.mock("@/components/ui/label", () => ({ Label: () => null }));
vi.mock("lucide-react", () => ({ ArrowRight: () => null }));

// Global fetch mock
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ---------------------------------------------------------------------------
// Import AFTER mocks so the module picks them up
// ---------------------------------------------------------------------------
import { StreamProvider, useStreamContext } from "../Stream";

function wrapper({ children }: { children: React.ReactNode }) {
  return <StreamProvider>{children}</StreamProvider>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetState() {
  state.messages = [];
  state.threadId = null;
  state.isLoading = false;
  state.error = null;
  urlThreadId = null;
  vi.clearAllMocks();
}

function threadResponse(messages: UIMessage[]) {
  return {
    ok: true,
    json: () => Promise.resolve({ messages }),
  };
}

function failedResponse() {
  return { ok: false, status: 500, text: () => Promise.resolve("Server Error") };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("StreamProvider - integration", () => {
  beforeEach(() => resetState());
  afterEach(() => vi.restoreAllMocks());

  // -----------------------------------------------------------------------
  // Basic smoke tests
  // -----------------------------------------------------------------------

  it("renders without crashing and exposes defaults", () => {
    const { result } = renderHook(() => useStreamContext(), { wrapper });
    expect(result.current.messages).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.threadId).toBeNull();
  });

  it("throws when used outside a provider", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useStreamContext())).toThrow(
      "useStreamContext must be used within a StreamProvider",
    );
    consoleSpy.mockRestore();
  });

  // -----------------------------------------------------------------------
  // Submit behaviour
  // -----------------------------------------------------------------------

  it("submit forwards message + threadId to sendMessage", () => {
    urlThreadId = "t1";
    mockFetch.mockResolvedValue(threadResponse([]));

    const { result } = renderHook(() => useStreamContext(), { wrapper });

    act(() => result.current.submit("hello"));
    expect(mockSendMessage).toHaveBeenCalledWith("hello", "t1");
  });

  it("submit uses undefined threadId when URL is empty", () => {
    const { result } = renderHook(() => useStreamContext(), { wrapper });

    act(() => result.current.submit("hello"));
    expect(mockSendMessage).toHaveBeenCalledWith("hello", undefined);
  });

  it("submit ignores undefined / empty messages", () => {
    const { result } = renderHook(() => useStreamContext(), { wrapper });

    act(() => result.current.submit(undefined));
    act(() => result.current.submit(""));
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Thread history loading (the critical path)
  // -----------------------------------------------------------------------

  it("fetches history when a threadId is present in the URL", async () => {
    urlThreadId = "thread-A";
    mockFetch.mockResolvedValue(
      threadResponse([
        { type: "human", content: "question" },
        { type: "ai", content: "answer" },
      ]),
    );

    renderHook(() => useStreamContext(), { wrapper });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/threads/thread-A");
    });

    await waitFor(() => {
      expect(mockLoadMessages).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ type: "human", content: "question" }),
          expect.objectContaining({ type: "ai", content: "answer" }),
        ]),
        "thread-A",
      );
    });
  });

  it("clears messages before fetching history (prevents flash)", async () => {
    urlThreadId = "thread-A";
    mockFetch.mockResolvedValue(
      threadResponse([{ type: "human", content: "hi" }]),
    );

    renderHook(() => useStreamContext(), { wrapper });

    await waitFor(() => {
      expect(mockLoadMessages).toHaveBeenCalled();
    });

    const calls = mockLoadMessages.mock.calls;
    // First call must clear
    expect(calls[0][0]).toEqual([]);
    expect(calls[0][1]).toBe("thread-A");
  });

  it("does NOT re-fetch when the same thread is loaded again", async () => {
    urlThreadId = "thread-X";
    mockFetch.mockResolvedValue(threadResponse([]));

    const { rerender } = renderHook(() => useStreamContext(), { wrapper });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    rerender();
    rerender();
    rerender();

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries fetch after an error when remounted (lastLoadedId is per-instance)", async () => {
    urlThreadId = "thread-Y";
    mockFetch.mockRejectedValueOnce(new Error("network fail"));

    const { unmount } = renderHook(() => useStreamContext(), { wrapper });

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    // Unmount the failed instance; mount fresh — the new instance has
    // lastLoadedId = null so it should fetch again.
    unmount();
    mockFetch.mockResolvedValue(threadResponse([]));
    renderHook(() => useStreamContext(), { wrapper });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/threads/thread-Y");
    });
  });

  // -----------------------------------------------------------------------
  // THREAD SWITCHING - the crash scenario
  // -----------------------------------------------------------------------

  it("handles thread switch without throwing (no Maximum update depth)", async () => {
    // --- Load thread A ---
    urlThreadId = "thread-A";
    mockFetch.mockResolvedValue(
      threadResponse([{ type: "human", content: "from A" }]),
    );

    const { rerender } = renderHook(() => useStreamContext(), { wrapper });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/threads/thread-A");
    });
    await waitFor(() => {
      expect(mockLoadMessages).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ content: "from A" })]),
        "thread-A",
      );
    });

    // --- Switch to thread B ---
    urlThreadId = "thread-B";
    mockFetch.mockResolvedValue(
      threadResponse([{ type: "human", content: "from B" }]),
    );

    // This is the operation that can trigger "Maximum update depth exceeded"
    expect(() => {
      rerender();
    }).not.toThrow();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/threads/thread-B");
    });

    await waitFor(() => {
      expect(mockLoadMessages).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ content: "from B" })]),
        "thread-B",
      );
    });
  });

  it("rapidly switches threads without infinite re-renders", async () => {
    const renderCounts: number[] = [];
    let renderCount = 0;

    function TrackRenders() {
      const ctx = useStreamContext();
      renderCount++;
      return null;
    }

    function TrackingWrapper({ children }: { children: React.ReactNode }) {
      return (
        <StreamProvider>
          <TrackRenders />
          {children}
        </StreamProvider>
      );
    }

    const threads = ["t-1", "t-2", "t-3", "t-4", "t-5"];

    for (const tid of threads) {
      urlThreadId = tid;
      mockFetch.mockResolvedValue(
        threadResponse([{ type: "human", content: `msg-${tid}` }]),
      );

      const { rerender, unmount } = renderHook(() => useStreamContext(), {
        wrapper: TrackingWrapper,
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(`/api/threads/${tid}`);
      });

      renderCounts.push(renderCount);
      renderCount = 0;
      unmount();
    }

    // Each render should be bounded (not growing exponentially).
    for (const count of renderCounts) {
      expect(count).toBeLessThanOrEqual(20);
    }
  });

  // -----------------------------------------------------------------------
  // Context value stability (no infinite loops from useMemo)
  // -----------------------------------------------------------------------

  it("context value reference is stable across inert re-renders", () => {
    const refs: unknown[] = [];

    function Capture() {
      const ctx = useStreamContext();
      refs.push(ctx);
      return null;
    }

    const { rerender } = renderHook(() => useStreamContext(), {
      wrapper: ({ children }) => (
        <StreamProvider>
          <Capture />
          {children}
        </StreamProvider>
      ),
    });

    rerender();
    rerender();
    rerender();

    expect(refs.length).toBeGreaterThanOrEqual(2);
    // Last two renders should produce the same context reference
    expect(refs[refs.length - 1]).toBe(refs[refs.length - 2]);
  });

  it("context value changes only when underlying state changes", () => {
    const refs: unknown[] = [];

    function Capture() {
      const ctx = useStreamContext();
      refs.push(ctx);
      return null;
    }

    const { rerender } = renderHook(() => useStreamContext(), {
      wrapper: ({ children }) => (
        <StreamProvider>
          <Capture />
          {children}
        </StreamProvider>
      ),
    });

    const afterInitial = refs[refs.length - 1];

    rerender();
    expect(refs[refs.length - 1]).toBe(afterInitial);

    rerender();
    expect(refs[refs.length - 1]).toBe(afterInitial);
  });

  // -----------------------------------------------------------------------
  // URL sync: clineThreadId -> URL
  // -----------------------------------------------------------------------

  it("does not auto-sync clineThreadId to URL (URL is source of truth)", () => {
    state.threadId = "new-session-id";
    urlThreadId = null;

    renderHook(() => useStreamContext(), { wrapper });

    // URL should NOT be auto-updated — only sidebar clicks set the URL
    expect(mockSetThreadId).not.toHaveBeenCalled();
  });

  it("does not overwrite URL when clineThreadId matches", async () => {
    urlThreadId = "same-id";
    state.threadId = "same-id";

    renderHook(() => useStreamContext(), { wrapper });

    expect(mockSetThreadId).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  it("survives a fetch failure and loads successfully on remount", async () => {
    urlThreadId = "err-thread";
    mockFetch.mockRejectedValueOnce(new Error("boom"));

    const { unmount } = renderHook(() => useStreamContext(), { wrapper });

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    // Unmount the failed instance, mount fresh with the same thread ID
    unmount();
    mockFetch.mockResolvedValue(threadResponse([{ type: "human", content: "recovered" }]));
    renderHook(() => useStreamContext(), { wrapper });

    await waitFor(() => {
      expect(mockLoadMessages).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ content: "recovered" })]),
        "err-thread",
      );
    });
  });

  it("handles non-ok HTTP response gracefully", async () => {
    urlThreadId = "http-err";
    mockFetch.mockResolvedValue(failedResponse());

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderHook(() => useStreamContext(), { wrapper });

    await waitFor(() => {
      expect(spy).toHaveBeenCalled();
    });

    spy.mockRestore();
  });

  it("does not crash when threadId is set but fetch returns empty messages", async () => {
    urlThreadId = "empty-thread";
    mockFetch.mockResolvedValue(threadResponse([]));

    const { result } = renderHook(() => useStreamContext(), { wrapper });

    await waitFor(() => {
      expect(mockLoadMessages).toHaveBeenCalled();
    });

    expect(result.current.messages).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // isLoading state
  // -----------------------------------------------------------------------

  it("reports isLoading while history is being fetched", async () => {
    let _resolveFetch: (v: unknown) => void;
    const pendingFetch = new Promise((resolve) => {
      _resolveFetch = resolve;
    });
    mockFetch.mockReturnValue(pendingFetch);

    urlThreadId = "loading-thread";

    const { result } = renderHook(() => useStreamContext(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });

    _resolveFetch!(threadResponse([]));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  it("does not fetch when threadId is null", () => {
    urlThreadId = null;

    renderHook(() => useStreamContext(), { wrapper });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("submit passes threadId from URL even when clineThreadId is null", () => {
    urlThreadId = "url-thread";
    state.threadId = null;

    const { result } = renderHook(() => useStreamContext(), { wrapper });

    act(() => result.current.submit("msg"));
    expect(mockSendMessage).toHaveBeenCalledWith("msg", "url-thread");
  });

  // -----------------------------------------------------------------------
  // Integration: full thread switch lifecycle
  // -----------------------------------------------------------------------

  it("full lifecycle: load A -> switch to B -> send message in B", async () => {
    // --- Load thread A ---
    urlThreadId = "thread-A";
    mockFetch.mockResolvedValue(
      threadResponse([{ type: "human", content: "A-msg" }]),
    );

    const { result, rerender } = renderHook(() => useStreamContext(), { wrapper });

    await waitFor(() => {
      expect(mockLoadMessages).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ content: "A-msg" })]),
        "thread-A",
      );
    });

    // --- Switch to thread B ---
    urlThreadId = "thread-B";
    mockFetch.mockResolvedValue(
      threadResponse([{ type: "human", content: "B-msg" }]),
    );

    rerender();

    await waitFor(() => {
      expect(mockLoadMessages).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ content: "B-msg" })]),
        "thread-B",
      );
    });

    // --- Send a message in thread B ---
    act(() => result.current.submit("new message in B"));
    expect(mockSendMessage).toHaveBeenCalledWith("new message in B", "thread-B");
  });

  it("multiple sequential switches settle correctly", async () => {
    const threads = ["alpha", "beta", "gamma", "delta"];

    for (const tid of threads) {
      urlThreadId = tid;
      mockFetch.mockResolvedValue(
        threadResponse([{ type: "human", content: tid }]),
      );

      const { rerender, unmount } = renderHook(() => useStreamContext(), {
        wrapper,
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(`/api/threads/${tid}`);
      });

      // Verify a clearing call was made for this thread
      const lastCall = mockLoadMessages.mock.calls;
      const clearingCall = lastCall.find(
        (c) => c[1] === tid && Array.isArray(c[0]) && c[0].length === 0,
      );
      expect(clearingCall).toBeTruthy();

      unmount();
    }
  });
});
