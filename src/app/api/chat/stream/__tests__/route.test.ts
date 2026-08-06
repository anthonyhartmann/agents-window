import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CoreSessionEvent } from "@/lib/cline/cline-types";

const { mockStartSession, mockSendPrompt, mockSubscribe } = vi.hoisted(() => ({
  mockStartSession: vi.fn(),
  mockSendPrompt: vi.fn(),
  mockSubscribe: vi.fn(),
}));

vi.mock("@/lib/cline/adapter", () => ({
  createClineAdapter: vi.fn().mockResolvedValue({
    startSession: mockStartSession,
    sendPrompt: mockSendPrompt,
    subscribe: mockSubscribe,
  }),
}));

import { POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  mockStartSession.mockResolvedValue({ sessionId: "new-session" });
});

/** Subscribe mock that emits "ended" after a short delay (after startSession resolves). */
function subscribeEnding() {
  mockSubscribe.mockImplementation((cb: (e: CoreSessionEvent) => void) => {
    setTimeout(() => {
      cb({ type: "ended", payload: { sessionId: "s1", reason: "done", ts: 0 } });
    }, 20);
    return () => {};
  });
}

function makePost(body: unknown) {
  return new Request("http://localhost:3000/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function collectSSE(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (let i = 0; i < 50; i++) {
    const { value, done } = await reader.read();
    if (done || !value) break;
    text += decoder.decode(value);
    if (text.includes("event: done") || text.includes("event: ended")) break;
  }
  return text;
}

describe("POST /api/chat/stream", () => {
  it("returns 400 for invalid JSON", async () => {
    const req = new Request("http://localhost:3000/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty message", async () => {
    subscribeEnding();
    const res = await POST(makePost({ message: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing message", async () => {
    subscribeEnding();
    const res = await POST(makePost({}));
    expect(res.status).toBe(400);
  });

  it("returns SSE stream with correct headers", async () => {
    subscribeEnding();
    const res = await POST(makePost({ message: "hello" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
    expect(res.headers.get("Connection")).toBe("keep-alive");
  });

  it("starts a new session and sends session event", async () => {
    subscribeEnding();
    const res = await POST(makePost({ message: "hello" }));
    const text = await collectSSE(res);

    expect(mockStartSession).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "hello", source: "web" }),
    );
    expect(text).toContain("event: session");
    expect(text).toContain('"sessionId":"new-session"');
  });

  it("streams agent_event from subscriber", async () => {
    mockSubscribe.mockImplementation((cb: (e: CoreSessionEvent) => void) => {
      setTimeout(() => {
        cb({
          type: "agent_event",
          payload: {
            sessionId: "s1",
            event: { type: "content_end", contentType: "text", text: "Hello world" },
          },
        });
        cb({ type: "ended", payload: { sessionId: "s1", reason: "done", ts: 0 } });
      }, 20);
      return () => {};
    });

    const res = await POST(makePost({ message: "hi" }));
    const text = await collectSSE(res);

    expect(text).toContain("event: agent_event");
    expect(text).toContain("Hello world");
    expect(text).toContain("event: ended");
  });

  it("sends error event on exception", async () => {
    mockStartSession.mockRejectedValue(new Error("Boom"));

    const res = await POST(makePost({ message: "fail" }));
    const text = await collectSSE(res);

    expect(text).toContain("event: error");
    expect(text).toContain("Boom");
  });

  it("resumes existing thread via sendPrompt", async () => {
    subscribeEnding();

    const res = await POST(makePost({ message: "continue", threadId: "existing-id" }));
    const text = await collectSSE(res);

    expect(mockStartSession).not.toHaveBeenCalled();
    expect(mockSendPrompt).toHaveBeenCalledWith({
      sessionId: "existing-id",
      prompt: "continue",
    });
    expect(text).toContain('"sessionId":"existing-id"');
  });

  it("starts new session when no threadId provided", async () => {
    subscribeEnding();

    const res = await POST(makePost({ message: "hello" }));
    await collectSSE(res);

    expect(mockStartSession).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "hello", source: "web" }),
    );
    expect(mockSendPrompt).not.toHaveBeenCalled();
  });
});
