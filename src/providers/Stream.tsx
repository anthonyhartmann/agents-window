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
  streamStatus: "idle" | "connecting" | "streaming";
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
  const { threadId: clineThreadId, messages, isLoading, streamStatus, error, sendMessage, loadMessages, clearError, stop } = useClineStream();

  const [loadingHistory, setLoadingHistory] = useState(false);
  const lastLoadedId = useRef<string | null>(null);

  // Seed threadId from the URL on mount in case nuqs hasn't hydrated yet
  const initialThreadIdRef = useRef<string | null>(null);
  if (typeof window !== "undefined" && initialThreadIdRef.current === null) {
    const params = new URLSearchParams(window.location.search);
    initialThreadIdRef.current = params.get("threadId");
  }
  const resolvedThreadId = threadId ?? initialThreadIdRef.current;

  // Fetch message history when threadId changes (sidebar click or direct URL)
  useEffect(() => {
    if (!resolvedThreadId) return;
    if (resolvedThreadId === lastLoadedId.current) return;

    // Sync nuqs state if it hasn't picked up the URL param yet
    if (!threadId && initialThreadIdRef.current) {
      setThreadId(initialThreadIdRef.current);
    }

    // Clear messages immediately so old thread's messages don't flash
    loadMessages([], resolvedThreadId);
    setLoadingHistory(true);
    lastLoadedId.current = resolvedThreadId;

    fetch(`/api/threads/${resolvedThreadId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load thread");
        return res.json();
      })
      .then((data: { messages?: UIMessage[] }) => {
        loadMessages(data.messages ?? [], resolvedThreadId);
      })
      .catch((err) => {
        console.error("Failed to load thread history:", err);
        lastLoadedId.current = null; // Allow retry
      })
      .finally(() => setLoadingHistory(false));
  }, [resolvedThreadId, loadMessages, setThreadId, threadId]);

  const submit = useCallback(
    (message: string | undefined, _config?: Record<string, unknown>) => {
      if (!message) return;
      sendMessage(message, resolvedThreadId ?? undefined);
    },
    [sendMessage, resolvedThreadId],
  );

  const value: StreamContextType = useMemo(() => ({
    messages,
    isLoading: isLoading || loadingHistory,
    streamStatus: loadingHistory ? "connecting" : streamStatus,
    error,
    threadId: clineThreadId ?? resolvedThreadId,
    submit,
    stop,
  }), [messages, isLoading, loadingHistory, streamStatus, error, clineThreadId, resolvedThreadId, submit, stop]);

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
