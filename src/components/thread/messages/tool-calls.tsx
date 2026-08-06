import type { UIMessage } from "@/lib/cline/cline-types";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  Wrench,
} from "lucide-react";

function isComplexValue(value: any): boolean {
  return Array.isArray(value) || (typeof value === "object" && value !== null);
}

function TruncatedArgs({ args }: { args: Record<string, any> }) {
  const keys = Object.keys(args);
  if (keys.length === 0) return <span className="text-muted-foreground">{}</span>;
  const summary = keys
    .slice(0, 3)
    .map((k) => {
      const v = args[k];
      const s = isComplexValue(v) ? JSON.stringify(v) : String(v);
      return `${k}=${s.length > 40 ? s.slice(0, 40) + "…" : s}`;
    })
    .join(", ");
  const extra = keys.length > 3 ? ` +${keys.length - 3} more` : "";
  return (
    <span className="truncate text-muted-foreground text-xs">
      {summary}
      {extra}
    </span>
  );
}

export function ToolCalls({
  toolCalls,
  isLoading,
}: {
  toolCalls: UIMessage["tool_calls"];
  isLoading?: boolean;
}) {
  if (!toolCalls || toolCalls.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      {toolCalls.map((tc, idx) => {
        const args = tc.args as Record<string, any>;
        const hasArgs = Object.keys(args).length > 0;
        return <ToolCallItem key={tc.id || idx} toolCall={tc} hasArgs={hasArgs} isLoading={isLoading} />;
      })}
    </div>
  );
}

function ToolCallItem({
  toolCall,
  hasArgs,
  isLoading,
}: {
  toolCall: { name: string; args: Record<string, unknown>; id?: string; type?: string };
  hasArgs: boolean;
  isLoading?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex flex-col">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-muted/50 transition-colors cursor-pointer"
      >
        <Wrench className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="font-medium text-foreground/80">{toolCall.name}</span>
        {!expanded && hasArgs && <TruncatedArgs args={toolCall.args as Record<string, any>} />}
        <span className="ml-auto shrink-0">
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="ml-5 rounded-md bg-muted/30 p-2 text-xs font-mono">
              {hasArgs ? (
                <pre className="whitespace-pre-wrap break-all text-muted-foreground">
                  {JSON.stringify(toolCall.args, null, 2)}
                </pre>
              ) : (
                <span className="text-muted-foreground">{}</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ToolResult({ message, isLoading }: { message: UIMessage; isLoading?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  const name = message.name ?? "tool";
  const hasContent = message.content && String(message.content).length > 0;
  const isError = message.status === "error";
  const isRunning = isLoading && !hasContent;

  return (
    <div className="flex flex-col">
      <button
        onClick={() => hasContent && setExpanded(!expanded)}
        className={`flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors ${
          hasContent ? "hover:bg-muted/50 cursor-pointer" : "cursor-default"
        }`}
      >
        {isRunning ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
        ) : isError ? (
          <XCircle className="h-3 w-3 shrink-0 text-red-500" />
        ) : (
          <CheckCircle2 className="h-3 w-3 shrink-0 text-green-500" />
        )}
        <span className="font-medium text-foreground/80">{name}</span>
        {isRunning && (
          <span className="text-muted-foreground animate-pulse">running…</span>
        )}
        {!isRunning && hasContent && (
          <span className="truncate text-muted-foreground text-xs max-w-[300px]">
            {String(message.content).slice(0, 100)}
            {String(message.content).length > 100 ? "…" : ""}
          </span>
        )}
        {hasContent && (
          <span className="ml-auto shrink-0">
            {expanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
          </span>
        )}
      </button>
      <AnimatePresence initial={false}>
        {expanded && hasContent && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="ml-5 rounded-md bg-muted/30 p-2 text-xs font-mono">
              <pre className="whitespace-pre-wrap break-all text-muted-foreground max-h-60 overflow-y-auto">
                {String(message.content)}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
