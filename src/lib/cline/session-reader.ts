/**
 * Filesystem-based Cline session reader.
 *
 * Reads session manifests directly from ~/.cline/data/sessions/{id}/{id}.json.
 * No ClineCore runtime needed — safe for server-side API routes.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import * as os from "node:os";
import type { ThreadSummary, UIMessage } from "./cline-types";
import { mapClineMessages } from "./map-messages";

// ---------------------------------------------------------------------------
// Default provider/model resolution
// ---------------------------------------------------------------------------

interface ProvidersFile {
  lastUsedProvider?: string;
  providers?: Record<string, unknown>;
  [key: string]: unknown;
}

interface RecentSession {
  provider?: string;
  model?: string;
  [key: string]: unknown;
}

/**
 * Resolve the default providerId and modelId from the user's Cline data.
 * Tries the most recent session first, then falls back to providers.json.
 */
export async function resolveDefaultProvider(): Promise<{ providerId: string; modelId: string }> {
  const dataDir = join(os.homedir(), ".cline", "data");

  // Try most recent session's manifest
  try {
    const sessionsDir = join(dataDir, "sessions");
    const entries = await readdir(sessionsDir);
    // Sort by name descending (newest first — IDs are timestamp-based)
    entries.sort((a, b) => b.localeCompare(a));

    for (const entry of entries.slice(0, 5)) {
      try {
        const raw = await readFile(join(sessionsDir, entry, `${entry}.json`), "utf-8");
        const manifest: RecentSession = JSON.parse(raw);
        if (manifest.provider && manifest.model) {
          return { providerId: manifest.provider, modelId: manifest.model };
        }
      } catch {
        continue;
      }
    }
  } catch {
    // sessions dir doesn't exist
  }

  // Fallback to providers.json
  try {
    const raw = await readFile(join(dataDir, "settings", "providers.json"), "utf-8");
    const settings: ProvidersFile = JSON.parse(raw);
    if (settings.lastUsedProvider) {
      return { providerId: settings.lastUsedProvider, modelId: "" };
    }
  } catch {
    // settings file doesn't exist
  }

  return { providerId: "", modelId: "" };
}

/** Shape of a session manifest JSON on disk. */
interface SessionManifest {
  session_id: string;
  source?: string;
  status?: string;
  started_at?: string;
  ended_at?: string;
  prompt?: string;
  metadata?: {
    title?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

function getClineDataDir(): string {
  return join(os.homedir(), ".cline", "data", "sessions");
}

function inferTitle(manifest: SessionManifest): string {
  if (manifest.metadata?.title) return manifest.metadata.title;
  if (manifest.prompt) {
    const firstLine = manifest.prompt
      .split("\n")[0]
      .replace(/<[^>]+>/g, "")
      .trim();
    if (firstLine.length > 0) {
      return firstLine.length > 80 ? firstLine.slice(0, 77) + "..." : firstLine;
    }
  }
  return "Untitled";
}

/**
 * Read thread summaries directly from the Cline sessions directory.
 *
 * Bypasses ClineCore entirely — reads JSON manifests from the filesystem.
 */
export async function listThreadsFromDisk(
  options?: { limit?: number },
): Promise<ThreadSummary[]> {
  const sessionsDir = getClineDataDir();

  let entries: string[];
  try {
    entries = await readdir(sessionsDir);
  } catch {
    return [];
  }

  const summaries: ThreadSummary[] = [];

  for (const entry of entries) {
    const manifestPath = join(sessionsDir, entry, `${entry}.json`);

    try {
      const raw = await readFile(manifestPath, "utf-8");
      const manifest: SessionManifest = JSON.parse(raw);

      summaries.push({
        id: manifest.session_id ?? entry,
        title: inferTitle(manifest),
        createdAt: manifest.started_at ?? "",
        updatedAt: manifest.ended_at ?? manifest.started_at ?? "",
        status: manifest.status ?? "unknown",
        source: manifest.source ?? "unknown",
      });
    } catch {
      continue;
    }

    if (options?.limit && summaries.length >= options.limit) break;
  }

  summaries.sort((a, b) => {
    if (!a.createdAt) return 1;
    if (!b.createdAt) return -1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return options?.limit ? summaries.slice(0, options.limit) : summaries;
}

// ---------------------------------------------------------------------------
// Single-session detail reader
// ---------------------------------------------------------------------------

/** Shape of the messages.json file on disk. */
interface MessagesFile {
  version?: number;
  messages?: Array<{
    id?: string;
    role: "user" | "assistant";
    content: string | Array<{ type: string; [key: string]: unknown }>;
    ts?: number;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export interface SessionDetail {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  source: string;
  messages: UIMessage[];
}

/**
 * Read a single session's manifest + messages from disk.
 *
 * Returns null if the session doesn't exist.
 */
export async function readSessionFromDisk(
  sessionId: string,
): Promise<SessionDetail | null> {
  const sessionsDir = getClineDataDir();
  const sessionDir = join(sessionsDir, sessionId);
  const manifestPath = join(sessionDir, `${sessionId}.json`);
  const messagesPath = join(sessionDir, `${sessionId}.messages.json`);

  // Read manifest
  let manifest: SessionManifest;
  try {
    const raw = await readFile(manifestPath, "utf-8");
    manifest = JSON.parse(raw);
  } catch {
    return null;
  }

  // Read messages (may not exist yet for very new sessions)
  let uiMessages: UIMessage[] = [];
  try {
    const raw = await readFile(messagesPath, "utf-8");
    const messagesFile: MessagesFile = JSON.parse(raw);
    if (messagesFile.messages) {
      // Limit to last 50 messages to avoid rendering crashes on long sessions
      const recent = messagesFile.messages.slice(-50);
      uiMessages = mapClineMessages(
        recent.map((m) => ({
          role: m.role,
          content: m.content as unknown as import("./cline-types").ContentBlock[],
          id: m.id,
          ts: m.ts,
        })),
      );
    }
  } catch {
    // No messages file — return empty array
  }

  return {
    id: manifest.session_id ?? sessionId,
    title: inferTitle(manifest),
    createdAt: manifest.started_at ?? "",
    updatedAt: manifest.ended_at ?? manifest.started_at ?? "",
    status: manifest.status ?? "unknown",
    source: manifest.source ?? "unknown",
    messages: uiMessages,
  };
}
