import { describe, it, expect } from "vitest";
import { mapAgentEvent } from "../map-events";
import type { CoreSessionEvent } from "../cline-types";

function makeAgentEvent(
  event: Extract<CoreSessionEvent, { type: "agent_event" }>["payload"]["event"],
  sessionId = "sess-1",
): CoreSessionEvent {
  return {
    type: "agent_event",
    payload: { sessionId, event },
  };
}

describe("mapAgentEvent", () => {
  it("maps content_start:text to text_start", () => {
    const chunks = mapAgentEvent(makeAgentEvent({ type: "content_start", contentType: "text" }));
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe("text_start");
  });

  it("maps content_end:text to text_end with text", () => {
    const chunks = mapAgentEvent(makeAgentEvent({ type: "content_end", contentType: "text", text: "Hello world" }));
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe("text_end");
    expect(chunks[0].text).toBe("Hello world");
  });

  it("maps content_start:reasoning to thinking_start", () => {
    const chunks = mapAgentEvent(makeAgentEvent({ type: "content_start", contentType: "reasoning" }));
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe("thinking_start");
  });

  it("maps content_end:reasoning to thinking_end", () => {
    const chunks = mapAgentEvent(makeAgentEvent({ type: "content_end", contentType: "reasoning", reasoning: "thinking..." }));
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe("thinking_end");
    expect(chunks[0].reasoning).toBe("thinking...");
  });

  it("maps content_start:tool to tool_call_start", () => {
    const chunks = mapAgentEvent(makeAgentEvent({ type: "content_start", contentType: "tool", toolName: "bash", toolCallId: "tc-1", input: { command: "ls" } }));
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe("tool_call_start");
    expect(chunks[0].toolCall).toEqual({ id: "tc-1", name: "bash", args: { command: "ls" } });
  });

  it("maps content_update:tool to tool_call_delta", () => {
    const chunks = mapAgentEvent(makeAgentEvent({ type: "content_update", contentType: "tool", toolName: "bash", toolCallId: "tc-1", update: { output: "running" } }));
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe("tool_call_delta");
    expect(chunks[0].toolCall?.result).toEqual({ output: "running" });
  });

  it("maps content_end:tool to tool_call_end", () => {
    const chunks = mapAgentEvent(makeAgentEvent({ type: "content_end", contentType: "tool", toolName: "bash", toolCallId: "tc-1", output: "result" }));
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe("tool_call_end");
    expect(chunks[0].toolCall?.result).toBe("result");
  });

  it("maps content_end:tool with error", () => {
    const chunks = mapAgentEvent(makeAgentEvent({ type: "content_end", contentType: "tool", toolName: "editor", toolCallId: "tc-2", error: "File not found" }));
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe("tool_call_end");
    expect(chunks[0].toolCall?.error).toBe("File not found");
  });

  it("maps ended event to done", () => {
    const chunks = mapAgentEvent({ type: "ended", payload: { sessionId: "s1", reason: "completed", ts: 1000 } });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe("done");
    expect(chunks[0].status).toBe("completed");
  });

  it("maps agent error to error chunk", () => {
    const chunks = mapAgentEvent(makeAgentEvent({ type: "error", error: new Error("Rate limit"), recoverable: false, iteration: 1 }));
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe("error");
    expect(chunks[0].error).toBe("Rate limit");
  });

  it("maps status event", () => {
    const chunks = mapAgentEvent({ type: "status", payload: { sessionId: "s1", status: "running" } });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe("status");
    expect(chunks[0].status).toBe("running");
  });

  it("maps agent_end hook to done", () => {
    const chunks = mapAgentEvent({ type: "hook", payload: { sessionId: "s1", hookEventName: "agent_end" } });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe("done");
  });

  it("returns empty for chunk events", () => {
    expect(mapAgentEvent({ type: "chunk", payload: { sessionId: "s1", stream: "stdout", chunk: "x", ts: 0 } })).toEqual([]);
  });

  it("returns empty for team_progress", () => {
    expect(mapAgentEvent({ type: "team_progress", payload: { sessionId: "s1", teamName: "t", lifecycle: {} as never, summary: {} as never } })).toEqual([]);
  });

  it("returns empty for unknown event type", () => {
    expect(mapAgentEvent({ type: "unknown_type", payload: {} } as unknown as CoreSessionEvent)).toEqual([]);
  });
});
