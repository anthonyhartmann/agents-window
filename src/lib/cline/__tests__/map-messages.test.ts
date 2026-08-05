import { describe, it, expect } from "vitest";
import { mapClineMessages } from "../map-messages";
import type { MessageWithMetadata } from "../cline-types";

describe("mapClineMessages", () => {
  it("maps a simple user string message", () => {
    const msgs = mapClineMessages([{ role: "user", content: "Hi" } as MessageWithMetadata]);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toEqual({ type: "human", content: "Hi", id: undefined });
  });

  it("maps a simple assistant string message", () => {
    const msgs = mapClineMessages([{ role: "assistant", content: "Hello!" } as MessageWithMetadata]);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toEqual({ type: "ai", content: "Hello!", id: undefined });
  });

  it("maps assistant text content blocks", () => {
    const msgs = mapClineMessages([
      { role: "assistant", content: [{ type: "text", text: "Some text" }], id: "m1" } as unknown as MessageWithMetadata,
    ]);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].type).toBe("ai");
    expect(msgs[0].content).toBe("Some text");
    expect(msgs[0].id).toBe("m1");
  });

  it("maps assistant thinking content blocks", () => {
    const msgs = mapClineMessages([
      { role: "assistant", content: [
        { type: "thinking", thinking: "Let me think..." },
        { type: "text", text: "Here is the answer" },
      ] } as unknown as MessageWithMetadata,
    ]);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].type).toBe("ai");
    expect(msgs[0].content).toBe("Let me think...");
    expect(msgs[1].type).toBe("ai");
    expect(msgs[1].content).toBe("Here is the answer");
  });

  it("maps tool_use content blocks to ai message with tool_calls", () => {
    const msgs = mapClineMessages([
      { role: "assistant", content: [
        { type: "text", text: "Let me run that." },
        { type: "tool_use", id: "tu-1", name: "bash", input: { command: "ls" } },
      ] } as unknown as MessageWithMetadata,
    ]);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].type).toBe("ai");
    expect(msgs[0].tool_calls).toHaveLength(1);
    expect(msgs[0].tool_calls![0]).toEqual({
      name: "bash",
      args: { command: "ls" },
      id: "tu-1",
      type: "tool_call",
    });
  });

  it("maps tool_result content blocks to tool messages", () => {
    const msgs = mapClineMessages([
      { role: "user", content: [
        { type: "tool_result", tool_use_id: "tu-1", name: "bash", content: "file.txt\n" },
      ] } as unknown as MessageWithMetadata,
    ]);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].type).toBe("tool");
    expect(msgs[0].content).toBe("file.txt\n");
    expect(msgs[0].tool_call_id).toBe("tu-1");
    expect(msgs[0].status).toBe("success");
  });

  it("maps tool_result with is_error", () => {
    const msgs = mapClineMessages([
      { role: "user", content: [
        { type: "tool_result", tool_use_id: "tu-2", name: "editor", content: "not found", is_error: true },
      ] } as unknown as MessageWithMetadata,
    ]);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].type).toBe("tool");
    expect(msgs[0].status).toBe("error");
  });

  it("returns empty for image-only messages", () => {
    const msgs = mapClineMessages([
      { role: "user", content: [
        { type: "image", data: "abc", mediaType: "image/png" },
      ] } as unknown as MessageWithMetadata,
    ]);
    expect(msgs).toHaveLength(0);
  });

  it("maps multiple messages in sequence", () => {
    const msgs = mapClineMessages([
      { role: "user", content: "Q1" } as MessageWithMetadata,
      { role: "assistant", content: "A1" } as MessageWithMetadata,
      { role: "user", content: "Q2" } as MessageWithMetadata,
      { role: "assistant", content: "A2" } as MessageWithMetadata,
    ]);
    expect(msgs).toHaveLength(4);
    expect(msgs.map((m) => m.type)).toEqual(["human", "ai", "human", "ai"]);
  });

  it("handles assistant message with only tool_use blocks (no text)", () => {
    const msgs = mapClineMessages([
      { role: "assistant", content: [
        { type: "tool_use", id: "tu-3", name: "read_file", input: { path: "/tmp/a" } },
      ] } as unknown as MessageWithMetadata,
    ]);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].type).toBe("ai");
    expect(msgs[0].content).toBe("");
    expect(msgs[0].tool_calls).toHaveLength(1);
    expect(msgs[0].tool_calls![0].name).toBe("read_file");
  });
});
