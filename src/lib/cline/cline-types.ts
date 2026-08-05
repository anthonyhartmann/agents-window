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
// Stream chunk (SSE event payload sent to the browser)
// ---------------------------------------------------------------------------

/**
 * The shape of a single SSE event pushed to the browser during streaming.
 * This mirrors what the LangGraph SDK's `useStream` hook expects so existing
 * UI components work without changes.
 */
export interface StreamChunk {
  /** Discriminator for the chunk type. */
  type:
    | "text_start"
    | "text_delta"
    | "text_end"
    | "thinking_start"
    | "thinking_delta"
    | "thinking_end"
    | "tool_call_start"
    | "tool_call_delta"
    | "tool_call_end"
    | "tool_result"
    | "error"
    | "done"
    | "status";
  /** For text chunks: the accumulated or delta text. */
  text?: string;
  /** For thinking chunks: reasoning text. */
  reasoning?: string;
  /** For tool call chunks. */
  toolCall?: {
    id: string;
    name: string;
    args?: Record<string, unknown>;
    result?: unknown;
    error?: string;
  };
  /** For status updates. */
  status?: string;
  /** For error events. */
  error?: string;
  /** Timestamp in ms. */
  ts?: number;
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
  /** Base64-encoded user images. */
  userImages?: string[];
  /** Existing thread ID to resume. */
  threadId?: string;
}

// ---------------------------------------------------------------------------
// Send prompt input
// ---------------------------------------------------------------------------

export interface SendPromptInput {
  sessionId: string;
  prompt: string;
  userImages?: string[];
}
