/**
 * Message Mapper — Cline messages → LangGraph-compatible UI messages
 *
 * Maps persisted Cline `MessageWithMetadata` objects to the `Message` shape
 * that the existing LangGraph-based UI components expect.
 *
 * The LangGraph Message type is:
 *   { type: "human"|"ai"|"tool", content: string | ContentComplex[], tool_calls?, ... }
 */

import type { MessageWithMetadata, ContentBlock } from "./cline-types";
import type { UIMessage } from "./cline-types";

// Re-export for convenience
export type { UIMessage };

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Map an array of Cline messages to LangGraph-compatible UI messages.
 */
export function mapClineMessages(messages: MessageWithMetadata[]): UIMessage[] {
  return messages.flatMap(mapSingleMessage);
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function mapSingleMessage(msg: MessageWithMetadata): UIMessage[] {
  const role = msg.role;

  // Simple string content — fast path
  if (typeof msg.content === "string") {
    if (role === "user") {
      return [{ type: "human", content: msg.content, id: msg.id }];
    }
    // Assistant with string content → AI message
    return [
      {
        type: "ai",
        content: msg.content,
        id: msg.id,
      },
    ];
  }

  // Array of content blocks — decompose into typed UI messages
  const blocks = msg.content as ContentBlock[];
  const results: UIMessage[] = [];

  // Accumulate tool use / tool result pairs
  const toolUseBlocks = blocks.filter((b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use");
  const toolResultBlocks = blocks.filter((b): b is Extract<ContentBlock, { type: "tool_result" }> => b.type === "tool_result");

  // Extract text content
  const textParts: string[] = [];
  const thinkingParts: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "text":
        textParts.push(block.text);
        break;
      case "thinking":
        thinkingParts.push(block.thinking);
        break;
      // Images, files → ignored for now (Phase 1)
      case "image":
      case "file":
      case "redacted_thinking":
        break;
    }
  }

  // Emit thinking as an AI message (if any)
  if (thinkingParts.length > 0 && role === "assistant") {
    results.push({
      type: "ai",
      content: thinkingParts.join("\n"),
      id: msg.id,
    });
  }

  // Emit text content
  if (textParts.length > 0) {
    if (role === "user") {
      results.push({
        type: "human",
        content: textParts.join("\n"),
        id: msg.id,
      });
    } else {
      results.push({
        type: "ai",
        content: textParts.join("\n"),
        id: msg.id,
        ...(toolUseBlocks.length > 0 && {
          tool_calls: toolUseBlocks.map((b) => ({
            name: b.name,
            args: b.input,
            id: b.id,
            type: "tool_call" as const,
          })),
        }),
      });
    }
  }

  // Emit tool results as tool messages
  for (const tr of toolResultBlocks) {
    const content =
      typeof tr.content === "string"
        ? tr.content
        : JSON.stringify(tr.content);

    results.push({
      type: "tool",
      content,
      tool_call_id: tr.tool_use_id,
      name: tr.name,
      status: tr.is_error ? "error" : "success",
    });
  }

  // If we had tool use blocks but no text, still emit the AI message with tool_calls
  if (textParts.length === 0 && toolUseBlocks.length > 0 && role === "assistant") {
    results.push({
      type: "ai",
      content: "",
      id: msg.id,
      tool_calls: toolUseBlocks.map((b) => ({
        name: b.name,
        args: b.input,
        id: b.id,
        type: "tool_call" as const,
      })),
    });
  }

  return results;
}
