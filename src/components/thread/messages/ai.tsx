import { useStreamContext } from "@/providers/Stream";
import { MarkdownText } from "../markdown-text";
import { cn } from "@/lib/utils";
import { ToolCalls, ToolResult } from "./tool-calls";
import { useQueryState, parseAsBoolean } from "nuqs";
import { GenericInterruptView } from "./generic-interrupt";
import type { UIMessage } from "@/lib/cline/cline-types";
import { Loader2, Brain, Loader2 as ThinkingSpinner } from "lucide-react";
import { useState, useEffect, useRef } from "react";

function CustomComponent(_props: {
  message: UIMessage;
  thread: ReturnType<typeof useStreamContext>;
}) {
  // Stubbed: custom UI components from LangGraph are not supported
  return null;
}

function parseAnthropicStreamedToolCalls(
  content: UIMessage["content"],
): UIMessage["tool_calls"] {
  if (!Array.isArray(content)) return undefined;
  const toolCallContents = content.filter((c) => c.type === "tool_use" && c.id);

  return toolCallContents.map((tc) => {
    const toolCall = tc as Record<string, any>;
    let json: Record<string, any> = {};
    if (toolCall?.input) {
      try {
        json = JSON.parse(toolCall.input) ?? {};
      } catch {
        // Pass
      }
    }
    return {
      name: toolCall.name ?? "",
      id: toolCall.id ?? "",
      args: json,
      type: "tool_call" as const,
    };
  });
}

interface InterruptProps {
  interrupt?: unknown;
  isLastMessage: boolean;
  hasNoAIOrToolMessages: boolean;
}

function Interrupt({
  interrupt,
  isLastMessage,
  hasNoAIOrToolMessages,
}: InterruptProps) {
  const fallbackValue = Array.isArray(interrupt)
    ? (interrupt as Record<string, any>[])
    : (((interrupt as { value?: unknown } | undefined)?.value ??
        interrupt) as Record<string, any>);

  return (
    <>
      {interrupt &&
      (isLastMessage || hasNoAIOrToolMessages) ? (
        <GenericInterruptView interrupt={fallbackValue} />
      ) : null}
    </>
  );
}

export function AssistantMessage({
  message,
  isLoading,
  handleRegenerate,
  showThinking = true,
}: {
  message: UIMessage | undefined;
  isLoading: boolean;
  handleRegenerate: () => void;
  showThinking?: boolean;
}) {
  const content = message?.content ?? [];
  const [hideToolCalls] = useQueryState(
    "hideToolCalls",
    parseAsBoolean.withDefault(false),
  );

  const thread = useStreamContext();
  const isLastMessage =
    thread.messages.at(-1)?.id === message?.id;
  const hasNoAIOrToolMessages = !thread.messages.find(
    (m) => m.type === "ai" || m.type === "tool",
  );
  const threadInterrupt = thread.interrupt;
  const anthropicStreamedToolCalls = Array.isArray(content)
    ? parseAnthropicStreamedToolCalls(content)
    : undefined;

  const hasToolCalls =
    message &&
    "tool_calls" in message &&
    message.tool_calls &&
    message.tool_calls.length > 0;
  const toolCallsHaveContents =
    hasToolCalls &&
    message.tool_calls?.some(
      (tc) => tc.args && Object.keys(tc.args).length > 0,
    );
  const hasAnthropicToolCalls = !!anthropicStreamedToolCalls?.length;
  const isToolResult = message?.type === "tool";

  if (isToolResult && hideToolCalls) {
    return null;
  }

  return (
    <div className="group mr-auto flex w-full items-start gap-2">
      <div className="flex w-full flex-col gap-2">
        {isToolResult ? (
          <>
            <ToolResult message={message} isLoading={isLoading} />
            <Interrupt
              interrupt={threadInterrupt}
              isLastMessage={isLastMessage}
              hasNoAIOrToolMessages={hasNoAIOrToolMessages}
            />
          </>
        ) : (
          <>
            {contentString.length > 0 && (
              <div className="py-1">
                <MarkdownText>{contentString}</MarkdownText>
              </div>
            )}

            {showThinking && message?.reasoning && (
              <ReasoningBlock reasoning={message.reasoning} isLoading={isLoading} />
            )}

            {!hideToolCalls && (
              <>
                {(hasToolCalls && toolCallsHaveContents && (
                  <ToolCalls toolCalls={message.tool_calls} isLoading={isLoading} />
                )) ||
                  (hasAnthropicToolCalls && (
                    <ToolCalls toolCalls={anthropicStreamedToolCalls} isLoading={isLoading} />
                  )) ||
                  (hasToolCalls && (
                    <ToolCalls toolCalls={message.tool_calls} isLoading={isLoading} />
                  ))}
              </>
            )}

            {message && (
              <CustomComponent
                message={message}
                thread={thread}
              />
            )}
            <Interrupt
              interrupt={threadInterrupt}
              isLastMessage={isLastMessage}
              hasNoAIOrToolMessages={hasNoAIOrToolMessages}
            />
          </>
        )}
      </div>
    </div>
  );
}

export function AssistantMessageLoading() {
  return (
    <div className="mr-auto flex items-start gap-2">
      <div className="bg-muted flex h-8 items-center gap-1 rounded-2xl px-4 py-2">
        <div className="bg-foreground/50 h-1.5 w-1.5 animate-[pulse_1.5s_ease-in-out_infinite] rounded-full"></div>
        <div className="bg-foreground/50 h-1.5 w-1.5 animate-[pulse_1.5s_ease-in-out_0.5s_infinite] rounded-full"></div>
        <div className="bg-foreground/50 h-1.5 w-1.5 animate-[pulse_1.5s_ease-in-out_1s_infinite] rounded-full"></div>
      </div>
    </div>
  );
}

export function StreamingIndicator() {
  return (
    <div className="mr-auto flex items-start gap-2">
      <div className="bg-muted flex h-8 items-center gap-2 rounded-2xl px-4 py-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground text-sm">Thinking...</span>
      </div>
    </div>
  );
}

function ReasoningBlock({ reasoning, isLoading }: { reasoning: string; isLoading?: boolean }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  if (!reasoning) return null;

  return (
    <div className="border-l-2 border-muted pl-3 py-1">
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Brain className="h-3 w-3" />
        <span className="font-medium">Thinking</span>
        {isLoading && !isCollapsed && (
          <Loader2 className="h-3 w-3 animate-spin" />
        )}
      </button>
      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          isCollapsed ? "max-h-0 opacity-0" : "max-h-[2000px] opacity-100",
        )}
      >
        <div ref={contentRef} className="mt-2 text-sm text-muted-foreground italic">
          <MarkdownText>{reasoning}</MarkdownText>
        </div>
      </div>
    </div>
  );
}
