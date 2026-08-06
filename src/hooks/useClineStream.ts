import { useState, useRef, useCallback, useEffect } from "react";
import { createParser, type EventSourceMessage } from "eventsource-parser";
import { aiMessage, toolMessage, toolCallEntry, type UIMessage } from "@/lib/cline/cline-types";

export type StreamStatus = "idle" | "connecting" | "streaming";

export interface ClineStreamState {
  messages: UIMessage[];
  isLoading: boolean;
  streamStatus: StreamStatus;
  error: string | null;
  threadId: string | null;
}

export interface UseClineStreamReturn extends ClineStreamState {
  sendMessage: (text: string, threadId?: string) => void;
  clearError: () => void;
  loadMessages: (messages: UIMessage[], threadId: string) => void;
  stop: () => void;
}

export interface StreamEvent {
  event: string;
  data: Record<string, unknown>;
}

export function parseEventSourceMessage(msg: EventSourceMessage): StreamEvent | null {
  if (!msg.data) return null;
  try {
    return { event: msg.event || "message", data: JSON.parse(msg.data) };
  } catch {
    return { event: msg.event || "message", data: { raw: msg.data } };
  }
}

export function processEvent(
  event: StreamEvent,
  current: ClineStreamState,
): ClineStreamState {
  const messages = [...current.messages];

  switch (event.event) {
    case "session": {
      const sessionId = String(event.data.sessionId ?? "");
      return { ...current, threadId: sessionId || current.threadId, streamStatus: "streaming" };
    }

    case "agent_event": {
      const e = event.data;
      const t = String(e.type ?? "");
      const contentType = String(e.contentType ?? "");
      const toolCallId = String(e.toolCallId ?? "");
      const toolName = String(e.toolName ?? "");
      const text = String(e.text ?? "");
      const reasoning = String(e.reasoning ?? "");
      const output = String(e.output ?? "");
      const input = (e.input ?? {}) as Record<string, unknown>;
      const error = String(e.error ?? "");

      if (t === "content_start" && contentType === "text") {
        messages.push(aiMessage(""));
      }

      if (t === "content_start" && contentType === "reasoning") {
        // Start a new AI message for reasoning content
        messages.push(aiMessage("", { reasoning: "" }));
      }

      if (t === "content_update" && contentType === "reasoning") {
        const delta = String(e.update ?? "");
        if (delta) {
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].type === "ai") {
              const existing = messages[i].reasoning ?? "";
              messages[i] = aiMessage(messages[i].content as string, {
                reasoning: existing + delta,
              });
              break;
            }
          }
        }
      }

      if (t === "content_end" && contentType === "reasoning" && reasoning) {
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].type === "ai") {
            messages[i] = aiMessage(messages[i].content as string, {
              reasoning,
            });
            break;
          }
        }
      }

      if (t === "content_update" && contentType === "text") {
        const delta = String(e.update ?? "");
        if (delta) {
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].type === "ai") {
              messages[i] = aiMessage(delta, {
                reasoning: messages[i].reasoning,
              });
              break;
            }
          }
        }
      }

      if (t === "content_end" && contentType === "text" && text) {
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].type === "ai") {
            messages[i] = aiMessage(text, {
              reasoning: messages[i].reasoning,
            });
            break;
          }
        }
      }

      if (t === "content_start" && contentType === "tool") {
        messages.push(aiMessage("", {
          tool_calls: [toolCallEntry(toolCallId, toolName, input)],
        }));
      }

      if (t === "content_end" && contentType === "tool") {
        messages.push(toolMessage(toolCallId, toolName, output, error ? "error" : "success"));
      }

      if (t === "error") {
        return { ...current, messages, error: error || "Unknown error", isLoading: false, streamStatus: "idle" };
      }

      return { ...current, messages };
    }

    case "ended":
      return { ...current, messages, isLoading: false, streamStatus: "idle" };

    case "error": {
      const errorMsg = String(event.data.error ?? "Stream failed");
      return { ...current, messages, error: errorMsg, isLoading: false, streamStatus: "idle" };
    }

    default:
      return current;
  }
}

export function useClineStream(): UseClineStreamReturn {
  const [state, setState] = useState<ClineStreamState>({
    messages: [], isLoading: false, streamStatus: "idle", error: null, threadId: null,
  });
  const abortRef = useRef<AbortController | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const sendMessage = useCallback((text: string, threadId?: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const activeThreadId = threadId ?? stateRef.current.threadId;
    const userMsg: UIMessage = { type: "human", content: text };
    setState((prev) => ({
      ...prev,
      messages: [...prev.messages, userMsg],
      isLoading: true,
      streamStatus: "connecting",
      error: null,
    }));

    (async () => {
      try {
        const res = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, threadId: activeThreadId }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const errText = await res.text();
          setState((prev) => ({ ...prev, isLoading: false, streamStatus: "idle", error: errText || `HTTP ${res.status}` }));
          return;
        }
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        const parser = createParser({
          onEvent: (msg: EventSourceMessage) => {
            const ev = parseEventSourceMessage(msg);
            if (ev) {
              setState((prev) => processEvent(ev, prev));
            }
          },
        });

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          parser.feed(decoder.decode(value, { stream: true }));
        }
        setState((prev) => ({ ...prev, isLoading: false, streamStatus: "idle" }));
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setState((prev) => ({ ...prev, isLoading: false, streamStatus: "idle" }));
          return;
        }
        setState((prev) => ({
          ...prev, isLoading: false, streamStatus: "idle",
          error: err instanceof Error ? err.message : "Stream failed",
        }));
      }
    })();
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const loadMessages = useCallback((messages: UIMessage[], tid: string) => {
    setState({
      messages,
      isLoading: false,
      streamStatus: "idle",
      error: null,
      threadId: tid,
    });
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { ...state, sendMessage, clearError, loadMessages, stop };
}
