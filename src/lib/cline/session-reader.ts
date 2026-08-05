/**
 * Filesystem-based Cline session reader.
 *
 * Reads session manifests directly from ~/.cline/data/sessions/{id}/{id}.json.
 * No ClineCore runtime needed — safe for server-side API routes.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import * as os from "node:os";
import type { ThreadSummary } from "./cline-types";

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
