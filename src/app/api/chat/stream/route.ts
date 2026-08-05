import { createClineAdapter } from "@/lib/cline/adapter";
import type { CoreSessionEvent } from "@/lib/cline/cline-types";

/**
 * POST /api/chat/stream
 *
 * Starts or resumes a Cline session and streams AgentEvents as SSE.
 * Accepts JSON: { message: string, threadId?: string }
 * Returns: text/event-stream
 */

let adapterSingleton: Awaited<ReturnType<typeof createClineAdapter>> | null = null;

async function getAdapter() {
  if (!adapterSingleton) {
    adapterSingleton = await createClineAdapter({ clientName: "agents-window-web" });
  }
  return adapterSingleton;
}

export async function POST(request: Request) {
  let body: { message?: string; threadId?: string };
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!body.message || body.message.trim().length === 0) {
    return new Response("Message is required", { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      let unsub: (() => void) | undefined;

      try {
        const adapter = await getAdapter();

        // Start or resume session
        const { sessionId } = await adapter.startSession({
          prompt: body.message,
          source: "web",
          ...(body.threadId && { threadId: body.threadId }),
        });

        // Send session ID immediately
        send("session", { sessionId });

        // Subscribe to events
        unsub = adapter.subscribe((event: CoreSessionEvent) => {
          switch (event.type) {
            case "agent_event": {
              const e = event.payload.event;
              send("agent_event", {
                type: e.type,
                sessionId: event.payload.sessionId,
                ...(e.type === "content_start" && {
                  contentType: e.contentType,
                  toolName: e.toolName,
                  toolCallId: e.toolCallId,
                }),
                ...(e.type === "content_update" && {
                  contentType: e.contentType,
                  toolName: e.toolName,
                  toolCallId: e.toolCallId,
                  update: e.update,
                }),
                ...(e.type === "content_end" && {
                  contentType: e.contentType,
                  text: e.text,
                  reasoning: e.reasoning,
                  toolName: e.toolName,
                  toolCallId: e.toolCallId,
                  output: e.output,
                  error: e.error,
                }),
                ...(e.type === "error" && {
                  error: e.error instanceof Error ? e.error.message : String(e.error),
                }),
                ...(e.type === "done" && {}),
              });
              break;
            }
            case "ended":
              send("ended", {
                sessionId: event.payload.sessionId,
                reason: event.payload.reason,
              });
              controller.close();
              break;
            case "chunk":
              // Raw terminal output — skip for now
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
                controller.close();
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
        });

        // If threadId provided, send follow-up to existing session
        if (body.threadId && sessionId !== body.threadId) {
          await adapter.sendPrompt({
            sessionId: body.threadId,
            prompt: body.message!,
          });
        }
      } catch (error) {
        send("error", {
          error: error instanceof Error ? error.message : "Stream failed",
        });
        controller.close();
      }

      // Cleanup on client disconnect
      request.signal.addEventListener("abort", () => {
        unsub?.();
        controller.close();
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
