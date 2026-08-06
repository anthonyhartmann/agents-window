"use client";

import React, {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useClineStream } from "@/hooks/useClineStream";
import type { UIMessage } from "@/lib/cline/cline-types";
import { useQueryState } from "nuqs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ArrowRight } from "lucide-react";

export interface StreamContextType {
  messages: UIMessage[];
  isLoading: boolean;
  error: string | null;
  threadId: string | null;
  submit: (message: string | undefined, config?: Record<string, unknown>) => void;
  stop: () => void;
  values?: Record<string, unknown>;
  interrupt?: unknown;
  setBranch?: (branch: string) => void;
}

const StreamContext = createContext<StreamContextType | undefined>(undefined);

function StreamSession({ children }: { children: ReactNode }) {
  const [threadId, setThreadId] = useQueryState("threadId");
  const { threadId: clineThreadId, messages, isLoading, error, sendMessage, loadMessages, clearError, stop } = useClineStream();

  const [loadingHistory, setLoadingHistory] = useState(false);
  const lastLoadedId = useRef<string | null>(null);

  // Fetch message history when threadId changes (sidebar click)
  useEffect(() => {
    if (!threadId) return;
    if (threadId === lastLoadedId.current) return;

    // Clear messages immediately so old thread's messages don't flash
    loadMessages([], threadId);
    setLoadingHistory(true);
    lastLoadedId.current = threadId;

    fetch(`/api/threads/${threadId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load thread");
        return res.json();
      })
      .then((data: { messages?: UIMessage[] }) => {
        loadMessages(data.messages ?? [], threadId);
      })
      .catch((err) => {
        console.error("Failed to load thread history:", err);
        lastLoadedId.current = null; // Allow retry
      })
      .finally(() => setLoadingHistory(false));
  }, [threadId, loadMessages]);

  const submit = useCallback(
    (message: string | undefined, _config?: Record<string, unknown>) => {
      if (!message) return;
      sendMessage(message, threadId ?? undefined);
    },
    [sendMessage, threadId],
  );

  const value: StreamContextType = useMemo(() => ({
    messages,
    isLoading: isLoading || loadingHistory,
    error,
    threadId: clineThreadId ?? threadId,
    submit,
    stop,
  }), [messages, isLoading, loadingHistory, error, clineThreadId, threadId, submit, stop]);

  return <StreamContext.Provider value={value}>{children}</StreamContext.Provider>;
}

export function StreamProvider({ children }: { children: ReactNode }) {
  return <StreamSession>{children}</StreamSession>;
}

export function useStreamContext(): StreamContextType {
  const context = useContext(StreamContext);
  if (context === undefined) {
    throw new Error("useStreamContext must be used within a StreamProvider");
  }
  return context;
}

export default StreamContext;
