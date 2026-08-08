import { createClineAdapter } from "@/lib/cline/adapter";
import type { CoreSessionEvent } from "@/lib/cline/cline-types";
import { logger } from "@/lib/logger";

/**
 * POST /api/chat/stream
 *
 * Starts or resumes a Cline session and streams AgentEvents as SSE.
 * Accepts JSON: { message: string, threadId?: string }
 * Returns: text/event-stream
 */

let adapterSingleton: Awaited<ReturnType<typeof createClineAdapter>> | null =
  null;

async function getAdapter() {
  if (!adapterSingleton) {
    adapterSingleton = await createClineAdapter({
      clientName: "agents-window-web",
      backendMode: "local",
    });
  }
  return adapterSingleton;
}

function serializeAgentEvent(
  event: Extract<CoreSessionEvent, { type: "agent_event" }>["payload"]["event"],
  sessionId: string,
): Record<string, unknown> {
  const base = { type: event.type, sessionId };

  if (event.type === "content_start") {
    return {
      ...base,
      contentType: event.contentType,
      toolName: event.toolName,
      toolCallId: event.toolCallId,
    };
  }
  if (event.type === "content_update") {
    return {
      ...base,
      contentType: event.contentType,
      toolName: event.toolName,
      toolCallId: event.toolCallId,
      update: event.update,
    };
  }
  if (event.type === "content_end") {
    return {
      ...base,
      contentType: event.contentType,
      text: event.text,
      reasoning: event.reasoning,
      toolName: event.toolName,
      toolCallId: event.toolCallId,
      output: event.output,
      error: event.error,
    };
  }
  if (event.type === "error") {
    return {
      ...base,
      error:
        event.error instanceof Error
          ? event.error.message
          : String(event.error),
    };
  }
  return base;
}

export async function POST(request: Request) {
  let body: { message?: string; threadId?: string };
  try {
    body = await request.json();
  } catch {
    logger.error("Invalid JSON body received in chat stream request", {
      category: "API_ROUTE",
      metadata: { url: request.url },
    });
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!body.message || body.message.trim().length === 0) {
    logger.warn("Chat stream request missing message parameter", {
      category: "API_ROUTE",
      threadId: body.threadId || null,
    });
    return new Response("Message is required", { status: 400 });
  }

  logger.info("SSE Stream requested", {
    threadId: body.threadId || null,
    category: "API_ROUTE",
    metadata: { hasMessage: !!body.message },
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
          );
        } catch {
          /* controller already closed — swallow */
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        unsub?.();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      let unsub: (() => void) | undefined;

      try {
        const adapter = await getAdapter();

        // Subscribe BEFORE starting so we don't miss early events.
        // Filter by sessionId when resuming to avoid duplicate events from
        // accumulated global subscribers.
        unsub = adapter.subscribe(
          (event: CoreSessionEvent) => {
            switch (event.type) {
              case "agent_event":
                send(
                  "agent_event",
                  serializeAgentEvent(
                    event.payload.event,
                    event.payload.sessionId,
                  ),
                );
                break;
              case "ended":
                send("ended", {
                  sessionId: event.payload.sessionId,
                  reason: event.payload.reason,
                });
                close();
                break;
              case "hook":
                send("hook", {
                  hookEventName: event.payload.hookEventName,
                  toolName: event.payload.toolName,
                });
                if (
                  event.payload.hookEventName === "agent_end" ||
                  event.payload.hookEventName === "session_shutdown"
                ) {
                  send("done", {});
                  close();
                }
                break;
              case "status":
                send("status", {
                  sessionId: event.payload.sessionId,
                  status: event.payload.status,
                });
                break;
              default:
                break;
            }
          },
          body.threadId ? { sessionId: body.threadId } : undefined,
        );

        let sessionId: string;
        if (body.threadId) {
          // Resume: load conversation history from disk and start a fresh
          // session seeded with prior context so the agent has memory.
          const allMessages = await adapter.readMessages(body.threadId);
          const existing = Array.isArray(allMessages)
            ? allMessages.slice(-50)
            : [];
          console.log(
            `[/api/chat/stream] Resume thread ${body.threadId}: loaded ${existing.length} messages (of ${Array.isArray(allMessages) ? allMessages.length : 0})`,
          );

          logger.info("Resuming existing Cline stream thread", {
            threadId: body.threadId,
            category: "SSE_STREAM",
            metadata: { loadedMessagesCount: existing.length },
          });

          const result = await adapter.startSession({
            prompt: body.message,
            source: "web",
            threadId: body.threadId,
            initialMessages: existing,
          });
          sessionId = result.sessionId;
        } else {
          // New session
          logger.info("Starting new Cline stream session", {
            threadId: null,
            category: "SSE_STREAM",
          });

          const result = await adapter.startSession({
            prompt: body.message,
            source: "web",
          });
          sessionId = result.sessionId;
        }

        send("session", { sessionId });
      } catch (error) {
        console.error("[/api/chat/stream] Error:", error);

        logger.error("SSE stream failed inside readable stream", {
          threadId: body.threadId || null,
          category: "SSE_STREAM",
          metadata: {
            error: error instanceof Error ? error.message : String(error),
          },
        });

        send("error", {
          error: error instanceof Error ? error.message : "Stream failed",
        });
        close();
      }

      request.signal.addEventListener("abort", () => {
        close();
      });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
