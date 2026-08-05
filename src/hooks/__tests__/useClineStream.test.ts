// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useClineStream, parseEventSourceMessage, processEvent } from "../useClineStream";

// ---------------------------------------------------------------------------
// parseEventSourceMessage tests
// ---------------------------------------------------------------------------

describe("parseEventSourceMessage", () => {
  it("parses a valid message", () => {
    const result = parseEventSourceMessage({ event: "done", data: '{"ok":true}', id: "" });
    expect(result).toEqual({ event: "done", data: { ok: true } });
  });

  it("defaults event to 'message'", () => {
    const result = parseEventSourceMessage({ event: "", data: '{"x":1}', id: "" });
    expect(result!.event).toBe("message");
  });

  it("returns null for empty data", () => {
    expect(parseEventSourceMessage({ event: "", data: "", id: "" })).toBeNull();
  });

  it("handles malformed JSON gracefully", () => {
    const result = parseEventSourceMessage({ event: "test", data: "not-json", id: "" });
    expect(result!.data).toEqual({ raw: "not-json" });
  });
});

// ---------------------------------------------------------------------------
// processEvent tests
// ---------------------------------------------------------------------------

const empty = { messages: [], isLoading: false, error: null, threadId: null };

describe("processEvent", () => {
  it("sets threadId on session event", () => {
    const result = processEvent({ event: "session", data: { sessionId: "s1" } }, empty);
    expect(result.threadId).toBe("s1");
  });

  it("starts AI message on content_start:text", () => {
    const result = processEvent(
      { event: "agent_event", data: { type: "content_start", contentType: "text" } },
      empty,
    );
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].type).toBe("ai");
    expect(result.messages[0].content).toBe("");
  });

  it("fills AI text on content_end:text", () => {
    let state = processEvent(
      { event: "agent_event", data: { type: "content_start", contentType: "text" } },
      empty,
    );
    state = processEvent(
      { event: "agent_event", data: { type: "content_end", contentType: "text", text: "Hello!" } },
      state,
    );
    expect(state.messages[0].content).toBe("Hello!");
  });

  it("adds tool_calls on content_start:tool", () => {
    const result = processEvent(
      { event: "agent_event", data: { type: "content_start", contentType: "tool", toolName: "bash", toolCallId: "tc-1", input: { cmd: "ls" } } },
      empty,
    );
    expect(result.messages[0].tool_calls).toHaveLength(1);
    expect(result.messages[0].tool_calls![0].name).toBe("bash");
  });

  it("adds tool result on content_end:tool", () => {
    const result = processEvent(
      { event: "agent_event", data: { type: "content_end", contentType: "tool", toolName: "bash", toolCallId: "tc-1", output: "file.txt" } },
      empty,
    );
    expect(result.messages[0].type).toBe("tool");
    expect(result.messages[0].status).toBe("success");
  });

  it("sets error on error agent_event", () => {
    const result = processEvent(
      { event: "agent_event", data: { type: "error", error: "Rate limit" } },
      empty,
    );
    expect(result.error).toBe("Rate limit");
    expect(result.isLoading).toBe(false);
  });

  it("sets isLoading false on ended", () => {
    const result = processEvent({ event: "ended", data: {} }, { ...empty, isLoading: true });
    expect(result.isLoading).toBe(false);
  });

  it("sets error on error event", () => {
    const result = processEvent({ event: "error", data: { error: "fail" } }, empty);
    expect(result.error).toBe("fail");
  });
});

// ---------------------------------------------------------------------------
// Hook integration tests (mocked fetch)
// ---------------------------------------------------------------------------

function mockFetchSSE(events: string) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(events));
      controller.close();
    },
  });

  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    body: { getReader: () => stream.getReader() },
  }));
}

describe("useClineStream hook", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accumulates text messages from SSE", async () => {
    mockFetchSSE(
      'event: session\ndata: {"sessionId":"s1"}\n\n' +
      'event: agent_event\ndata: {"type":"content_start","contentType":"text"}\n\n' +
      'event: agent_event\ndata: {"type":"content_end","contentType":"text","text":"Hi!"}\n\n' +
      'event: ended\ndata: {"reason":"done"}\n\n'
    );

    const { result } = renderHook(() => useClineStream());

    act(() => result.current.sendMessage("hello"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.threadId).toBe("s1");
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe("Hi!");
  });

  it("surfaces fetch errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network fail")));

    const { result } = renderHook(() => useClineStream());

    act(() => result.current.sendMessage("hello"));

    await waitFor(() => {
      expect(result.current.error).toBe("Network fail");
    });
  });

  it("surfaces HTTP errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve("Bad request"),
    }));

    const { result } = renderHook(() => useClineStream());

    act(() => result.current.sendMessage("hello"));

    await waitFor(() => {
      expect(result.current.error).toBe("Bad request");
    });
  });

  it("clearError resets error state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fail")));

    const { result } = renderHook(() => useClineStream());

    act(() => result.current.sendMessage("hello"));

    await waitFor(() => {
      expect(result.current.error).toBe("fail");
    });

    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });

  it("handles tool call events", async () => {
    mockFetchSSE(
      'event: agent_event\ndata: {"type":"content_start","contentType":"tool","toolName":"bash","toolCallId":"tc-1","input":{"cmd":"ls"}}\n\n' +
      'event: agent_event\ndata: {"type":"content_end","contentType":"tool","toolName":"bash","toolCallId":"tc-1","output":"file.txt"}\n\n' +
      'event: ended\ndata: {}\n\n'
    );

    const { result } = renderHook(() => useClineStream());

    act(() => result.current.sendMessage("list files"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].tool_calls![0].name).toBe("bash");
    expect(result.current.messages[1].type).toBe("tool");
  });
});
