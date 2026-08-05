/**
 * Event Mapper — CoreSessionEvent → StreamChunk
 *
 * Maps Cline SDK session events to the stream chunk shape expected by the
 * browser-side UI. Unknown or unsupported event types produce a no-op
 * (empty array) rather than throwing.
 */

import type { CoreSessionEvent } from "./cline-types";
import type { StreamChunk } from "./cline-types";

/**
 * Map a single CoreSessionEvent to zero or more StreamChunks.
 *
 * Returns an array because some SDK events decompose into multiple UI chunks
 * (e.g. a tool event yields a tool_call_end + tool_result). Most events
 * return a single-element array; unsupported events return `[]`.
 */
export function mapAgentEvent(event: CoreSessionEvent): StreamChunk[] {
  switch (event.type) {
    // ---- Raw stdout/stderr chunks (used for terminal output) ----
    case "chunk":
      return [];

    // ---- Agent lifecycle events ----
    case "agent_event":
      return mapAgentInnerEvent(event.payload.event, event.payload.sessionId);

    // ---- Terminal events ----
    case "ended":
      return [
        {
          type: "done",
          status: event.payload.reason,
          ts: event.payload.ts,
        },
      ];

    // ---- Tool / hook events ----
    case "hook":
      return mapHookEvent(event.payload.hookEventName, event.payload);

    // ---- Status updates ----
    case "status":
      return [
        {
          type: "status",
          status: event.payload.status,
        },
      ];

    // ---- Team progress, pending prompts, snapshots — no-op for now ----
    case "team_progress":
    case "pending_prompts":
    case "pending_prompt_submitted":
    case "session_snapshot":
      return [];

    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Inner agent event mapper
// ---------------------------------------------------------------------------

type AgentEventPayload = Extract<CoreSessionEvent, { type: "agent_event" }>["payload"]["event"];

function mapAgentInnerEvent(event: AgentEventPayload, sessionId: string): StreamChunk[] {
  const ts = Date.now();

  switch (event.type) {
    case "content_start": {
      if (event.contentType === "text") {
        return [{ type: "text_start", ts }];
      }
      if (event.contentType === "reasoning") {
        return [{ type: "thinking_start", ts }];
      }
      if (event.contentType === "tool" && event.toolName && event.toolCallId) {
        return [
          {
            type: "tool_call_start",
            toolCall: {
              id: event.toolCallId,
              name: event.toolName,
              args: (event.input as Record<string, unknown>) ?? {},
            },
            ts,
          },
        ];
      }
      return [];
    }

    case "content_update": {
      if (event.contentType === "tool" && event.toolCallId && event.toolName) {
        return [
          {
            type: "tool_call_delta",
            toolCall: {
              id: event.toolCallId,
              name: event.toolName,
              result: event.update,
            },
            ts,
          },
        ];
      }
      return [];
    }

    case "content_end": {
      if (event.contentType === "text") {
        return [
          {
            type: "text_end",
            text: event.text ?? "",
            ts,
          },
        ];
      }
      if (event.contentType === "reasoning") {
        return [
          {
            type: "thinking_end",
            reasoning: event.reasoning ?? "",
            ts,
          },
        ];
      }
      if (event.contentType === "tool" && event.toolCallId && event.toolName) {
        const chunks: StreamChunk[] = [
          {
            type: "tool_call_end",
            toolCall: {
              id: event.toolCallId,
              name: event.toolName,
              result: event.output,
              ...(event.error && { error: event.error }),
            },
            ts,
          },
        ];
        return chunks;
      }
      return [];
    }

    case "iteration_start":
      return [];

    case "iteration_end":
      return [];

    case "usage":
      return [];

    case "notice":
      return [];

    case "done":
      return [{ type: "done", ts }];

    case "error":
      return [
        {
          type: "error",
          error: event.error instanceof Error ? event.error.message : String(event.error),
          ts,
        },
      ];

    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Hook event mapper
// ---------------------------------------------------------------------------

function mapHookEvent(
  hookName: string,
  payload: { sessionId: string; toolName?: string; inputTokens?: number; outputTokens?: number },
): StreamChunk[] {
  switch (hookName) {
    case "tool_call":
      return [];
    case "tool_result":
      return [];
    case "agent_end":
      return [{ type: "done" }];
    case "agent_error":
      return [{ type: "error", error: "Agent error from hook" }];
    case "session_shutdown":
      return [{ type: "done", status: "shutdown" }];
    default:
      return [];
  }
}
