// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useClineStream,
  parseEventSourceMessage,
  processEvent,
} from "../useClineStream";
import type { UIMessage } from "@/lib/cline/cline-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sse(events: string) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(events));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function sseMultiChunk(chunks: string[]) {
  let i = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(new TextEncoder().encode(chunks[i]));
        i++;
      } else {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function mockFetch(response: Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(response),
  );
}

function mockFetchSequence(responses: Response[]) {
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(() => Promise.resolve(responses[i++])),
  );
}

// ---------------------------------------------------------------------------
// parseEventSourceMessage
// ---------------------------------------------------------------------------

describe("parseEventSourceMessage", () => {
  it("parses a valid message", () => {
    const r = parseEventSourceMessage({ event: "done", data: '{"ok":true}', id: "" });
    expect(r).toEqual({ event: "done", data: { ok: true } });
  });

  it("defaults event to message", () => {
    const r = parseEventSourceMessage({ event: "", data: '{"x":1}', id: "" });
    expect(r!.event).toBe("message");
  });

  it("returns null for empty data", () => {
    expect(parseEventSourceMessage({ event: "", data: "", id: "" })).toBeNull();
  });

  it("handles malformed JSON", () => {
    const r = parseEventSourceMessage({ event: "test", data: "bad", id: "" });
    expect(r!.data).toEqual({ raw: "bad" });
  });
});

// ---------------------------------------------------------------------------
// processEvent
// ---------------------------------------------------------------------------

const empty = { messages: [], isLoading: false, error: null, threadId: null };

describe("processEvent", () => {
  it("sets threadId on session event", () => {
    const r = processEvent({ event: "session", data: { sessionId: "s1" } }, empty);
    expect(r.threadId).toBe("s1");
  });

  it("starts empty AI message on content_start:text", () => {
    const r = processEvent(
      { event: "agent_event", data: { type: "content_start", contentType: "text" } },
      empty,
    );
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0]).toEqual({ type: "ai", content: "" });
  });

  it("fills AI text on content_end:text", () => {
    let s = processEvent(
      { event: "agent_event", data: { type: "content_start", contentType: "text" } },
      empty,
    );
    s = processEvent(
      { event: "agent_event", data: { type: "content_end", contentType: "text", text: "Hello!" } },
      s,
    );
    expect(s.messages[0].content).toBe("Hello!");
  });

  it("adds tool_calls on content_start:tool", () => {
    const r = processEvent(
      { event: "agent_event", data: { type: "content_start", contentType: "tool", toolName: "bash", toolCallId: "tc-1", input: { cmd: "ls" } } },
      empty,
    );
    expect(r.messages[0].tool_calls).toHaveLength(1);
    expect(r.messages[0].tool_calls![0].name).toBe("bash");
  });

  it("adds tool result on content_end:tool", () => {
    const r = processEvent(
      { event: "agent_event", data: { type: "content_end", contentType: "tool", toolName: "bash", toolCallId: "tc-1", output: "file.txt" } },
      empty,
    );
    expect(r.messages[0].type).toBe("tool");
    expect(r.messages[0].status).toBe("success");
  });

  it("sets error on error agent_event", () => {
    const r = processEvent(
      { event: "agent_event", data: { type: "error", error: "Rate limit" } },
      empty,
    );
    expect(r.error).toBe("Rate limit");
    expect(r.isLoading).toBe(false);
  });

  it("sets isLoading false on ended", () => {
    const r = processEvent({ event: "ended", data: {} }, { ...empty, isLoading: true });
    expect(r.isLoading).toBe(false);
  });

  it("sets error on error event", () => {
    const r = processEvent({ event: "error", data: { error: "fail" } }, empty);
    expect(r.error).toBe("fail");
  });
});

// ---------------------------------------------------------------------------
// Hook lifecycle tests
// ---------------------------------------------------------------------------

describe("useClineStream", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("adds user message to messages immediately on sendMessage", async () => {
    mockFetch(sse('event: ended\ndata: {}\n\n'));

    const { result } = renderHook(() => useClineStream());

    expect(result.current.messages).toHaveLength(0);

    act(() => result.current.sendMessage("hello"));

    // User message should appear immediately, before any stream events
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toEqual({ type: "human", content: "hello" });
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it("full lifecycle: user msg → session → ai text → done", async () => {
    mockFetch(
      sse(
        'event: session\ndata: {"sessionId":"s1"}\n\n' +
        'event: agent_event\ndata: {"type":"content_start","contentType":"text"}\n\n' +
        'event: agent_event\ndata: {"type":"content_end","contentType":"text","text":"Hi there!"}\n\n' +
        'event: ended\ndata: {"reason":"done"}\n\n',
      ),
    );

    const { result } = renderHook(() => useClineStream());

    act(() => result.current.sendMessage("hello"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.threadId).toBe("s1");
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toEqual({ type: "human", content: "hello" });
    expect(result.current.messages[1]).toEqual({ type: "ai", content: "Hi there!" });
    expect(result.current.error).toBeNull();
  });

  it("accumulates multiple AI messages", async () => {
    mockFetch(
      sse(
        'event: agent_event\ndata: {"type":"content_start","contentType":"text"}\n\n' +
        'event: agent_event\ndata: {"type":"content_end","contentType":"text","text":"First"}\n\n' +
        'event: agent_event\ndata: {"type":"content_start","contentType":"text"}\n\n' +
        'event: agent_event\ndata: {"type":"content_end","contentType":"text","text":"Second"}\n\n' +
        'event: ended\ndata: {}\n\n',
      ),
    );

    const { result } = renderHook(() => useClineStream());

    act(() => result.current.sendMessage("go"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const aiMessages = result.current.messages.filter((m) => m.type === "ai");
    expect(aiMessages).toHaveLength(2);
    expect(aiMessages[0].content).toBe("First");
    expect(aiMessages[1].content).toBe("Second");
  });

  it("handles tool call lifecycle: start → result", async () => {
    mockFetch(
      sse(
        'event: agent_event\ndata: {"type":"content_start","contentType":"tool","toolName":"bash","toolCallId":"tc-1","input":{"cmd":"ls"}}\n\n' +
        'event: agent_event\ndata: {"type":"content_end","contentType":"tool","toolName":"bash","toolCallId":"tc-1","output":"file.txt"}\n\n' +
        'event: ended\ndata: {}\n\n',
      ),
    );

    const { result } = renderHook(() => useClineStream());

    act(() => result.current.sendMessage("list files"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.messages).toHaveLength(3);
    expect(result.current.messages[0]).toEqual({ type: "human", content: "list files" });
    expect(result.current.messages[1].tool_calls![0].name).toBe("bash");
    expect(result.current.messages[2].type).toBe("tool");
    expect(result.current.messages[2].content).toBe("file.txt");
  });

  it("surfaces fetch errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network fail")));

    const { result } = renderHook(() => useClineStream());

    act(() => result.current.sendMessage("hello"));

    await waitFor(() => expect(result.current.error).toBe("Network fail"));
    expect(result.current.isLoading).toBe(false);
    // User message should still be in the list
    expect(result.current.messages[0]).toEqual({ type: "human", content: "hello" });
  });

  it("surfaces HTTP errors", async () => {
    mockFetch(
      new Response("Bad request", { status: 400 }),
    );

    const { result } = renderHook(() => useClineStream());

    act(() => result.current.sendMessage("hello"));

    await waitFor(() => expect(result.current.error).toBe("Bad request"));
    expect(result.current.isLoading).toBe(false);
  });

  it("clearError resets error state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fail")));
    const { result } = renderHook(() => useClineStream());

    act(() => result.current.sendMessage("hello"));
    await waitFor(() => expect(result.current.error).toBe("fail"));

    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });

  it("sends threadId when resuming a conversation", async () => {
    mockFetch(
      sse(
        'event: session\ndata: {"sessionId":"s1"}\n\n' +
        'event: ended\ndata: {}\n\n',
      ),
    );

    const { result } = renderHook(() => useClineStream());

    act(() => result.current.sendMessage("first message"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Now send with explicit threadId
    mockFetch(
      sse(
        'event: session\ndata: {"sessionId":"s1"}\n\n' +
        'event: agent_event\ndata: {"type":"content_start","contentType":"text"}\n\n' +
        'event: agent_event\ndata: {"type":"content_end","contentType":"text","text":"Continued!"}\n\n' +
        'event: ended\ndata: {}\n\n',
      ),
    );

    act(() => result.current.sendMessage("second message", "s1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.messages.filter((m) => m.type === "human")).toHaveLength(2);
    expect(result.current.messages.filter((m) => m.type === "ai")).toHaveLength(1);
  });

  it("aborts previous stream when new message sent", async () => {
    // First fetch never resolves (slow stream)
    let resolveFirst: () => void;
    const firstStream = new Promise<Response>((resolve) => {
      resolveFirst = () =>
        resolve(
          sse(
            'event: session\ndata: {"sessionId":"s1"}\n\n' +
            'event: ended\ndata: {}\n\n',
          ),
        );
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(firstStream));

    const { result } = renderHook(() => useClineStream());

    act(() => result.current.sendMessage("first"));
    expect(result.current.isLoading).toBe(true);

    // Second message aborts first
    mockFetch(
      sse(
        'event: session\ndata: {"sessionId":"s2"}\n\n' +
        'event: agent_event\ndata: {"type":"content_start","contentType":"text"}\n\n' +
        'event: agent_event\ndata: {"type":"content_end","contentType":"text","text":"Quick!"}\n\n' +
        'event: ended\ndata: {}\n\n',
      ),
    );

    act(() => result.current.sendMessage("second"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Only second message's AI response should be present
    const aiMessages = result.current.messages.filter((m) => m.type === "ai");
    expect(aiMessages).toHaveLength(1);
    expect(aiMessages[0].content).toBe("Quick!");
  });

  it("handles SSE events arriving in multiple chunks", async () => {
    mockFetch(
      sseMultiChunk([
        'event: session\ndata: {"sessionId":"s1"}\n\n',
        'event: agent_event\ndata: {"type":"content_start","contentType":"text"}\n',
        '\nevent: agent_event\ndata: {"type":"content_end","contentType":"text","text":"Chunked!"}\n\n',
        'event: ended\ndata: {}\n\n',
      ]),
    );

    const { result } = renderHook(() => useClineStream());

    act(() => result.current.sendMessage("go"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const aiMessages = result.current.messages.filter((m) => m.type === "ai");
    expect(aiMessages).toHaveLength(1);
    expect(aiMessages[0].content).toBe("Chunked!");
  });

  it("stop aborts an in-flight stream", async () => {
    // Fetch mock that rejects when the abort signal fires
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      }),
    );

    const { result } = renderHook(() => useClineStream());

    act(() => result.current.sendMessage("hello"));
    expect(result.current.isLoading).toBe(true);

    act(() => result.current.stop());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it("handles content_update:text by updating last AI message", async () => {
    mockFetch(
      sse(
        'event: agent_event\ndata: {"type":"content_start","contentType":"text"}\n\n' +
        'event: agent_event\ndata: {"type":"content_update","contentType":"text","update":"Hello"}\n\n' +
        'event: agent_event\ndata: {"type":"content_end","contentType":"text","text":"Hello, world!"}\n\n' +
        'event: ended\ndata: {}\n\n',
      ),
    );

    const { result } = renderHook(() => useClineStream());

    act(() => result.current.sendMessage("hi"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Final text from content_end should win over content_update
    const aiMessages = result.current.messages.filter((m) => m.type === "ai");
    expect(aiMessages).toHaveLength(1);
    expect(aiMessages[0].content).toBe("Hello, world!");
  });
});
