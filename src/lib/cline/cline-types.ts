/**
 * Narrow type interfaces for the Cline SDK adapter.
 *
 * These types isolate the rest of the app from the semi-private @cline/sdk.
 * Only `adapter.ts` imports from `@cline/sdk` — everything else goes through
 * these types.
 */

// ---------------------------------------------------------------------------
// Cline SDK types we re-export (narrowed)
// ---------------------------------------------------------------------------

export type { CoreSessionEvent, SessionChunkEvent, SessionEndedEvent } from "@cline/sdk";
export type { MessageWithMetadata, ContentBlock } from "@cline/sdk";

// ---------------------------------------------------------------------------
// Adapter configuration
// ---------------------------------------------------------------------------

export interface ClineAdapterOptions {
  /** Client name reported to the Cline runtime. */
  clientName?: string;
  /** Backend mode: "auto" | "local" | "hub" | "remote". Defaults to "auto". */
  backendMode?: "auto" | "local" | "hub" | "remote";
}

// ---------------------------------------------------------------------------
// Thread summary (for the sidebar thread list)
// ---------------------------------------------------------------------------

export interface ThreadSummary {
  id: string;
  title: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  status: string;
  source: string;
}

// ---------------------------------------------------------------------------
// UI message (matches LangGraph Message shape)
// ---------------------------------------------------------------------------

/** Matches the LangGraph SDK's Message type so existing UI renderers work. */
export interface UIMessage {
  type: "human" | "ai" | "tool";
  content: string | Array<{ type: string; text?: string; [key: string]: unknown }>;
  tool_calls?: Array<{
    name: string;
    args: Record<string, unknown>;
    id?: string;
    type?: "tool_call";
  }>;
  tool_call_id?: string;
  id?: string;
  name?: string;
  status?: "error" | "success";
}

// ---------------------------------------------------------------------------
// Start session input (simplified for our use case)
// ---------------------------------------------------------------------------

export interface StartSessionInput {
  /** The prompt to send. */
  prompt?: string;
  /** Provider ID (e.g. "anthropic", "openai"). */
  providerId?: string;
  /** Model ID (e.g. "claude-opus-4-1"). */
  modelId?: string;
  /** Source identifier. */
  source?: string;
  /** Existing thread ID to resume. */
  threadId?: string;
  /** Base64-encoded user images. */
  userImages?: string[];

}

// ---------------------------------------------------------------------------
// Send prompt input
// ---------------------------------------------------------------------------

export interface SendPromptInput {
  sessionId: string;
  prompt: string;
  userImages?: string[];
}

// ---------------------------------------------------------------------------
// UI message factories
// ---------------------------------------------------------------------------

export function humanMessage(content: string, id?: string): UIMessage {
  return { type: "human", content, ...(id && { id }) };
}

export function aiMessage(content: string, opts?: { id?: string; tool_calls?: UIMessage["tool_calls"] }): UIMessage {
  return { type: "ai", content, ...(opts?.id && { id: opts.id }), ...(opts?.tool_calls && { tool_calls: opts.tool_calls }) };
}

export function toolMessage(toolCallId: string, name: string, content: string, status: "success" | "error" = "success"): UIMessage {
  return { type: "tool", content, tool_call_id: toolCallId, name, status };
}

export function toolCallEntry(id: string, name: string, args: Record<string, unknown> = {}) {
  return { id, name, args, type: "tool_call" as const };
}
