/**
 * Cline SDK Adapter
 *
 * This is the ONLY file that imports from `@cline/sdk` / `@cline/core`.
 * Everything else in the app goes through this module.
 *
 * The adapter wraps the semi-private ClineCore class and exposes a clean,
 * typed API for the rest of the application.
 */

import { ClineCore } from "@cline/sdk";
import type {
  ClineAdapterOptions,
  CoreSessionEvent,
  SendPromptInput,
  StartSessionInput,
  ThreadSummary,
} from "./cline-types";

// Re-export types so consumers don't need to import from this file's internals
export type { ClineAdapterOptions, ThreadSummary, SendPromptInput, StartSessionInput };

// ---------------------------------------------------------------------------
// Adapter return type
// ---------------------------------------------------------------------------

export interface ClineAdapter {
  /** The underlying ClineCore instance (escape hatch — avoid using directly). */
  readonly core: ClineCore;

  /** Start a new session. Returns the session ID and metadata. */
  startSession(input: StartSessionInput): Promise<{ sessionId: string }>;

  /** Send a follow-up prompt to an existing session. */
  sendPrompt(input: SendPromptInput): Promise<void>;

  /** Read message history for a session. */
  readMessages(sessionId: string): Promise<unknown[]>;

  /** List session history (thread summaries). */
  listHistory(options?: { limit?: number; source?: string }): Promise<ThreadSummary[]>;

  /** Subscribe to session events. Returns an unsubscribe function. */
  subscribe(
    listener: (event: CoreSessionEvent) => void,
  ): () => void;

  /** Delete a session. */
  deleteSession(sessionId: string): Promise<boolean>;

  /** Update session metadata. */
  updateSession(sessionId: string, meta: { title?: string }): Promise<void>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a Cline adapter instance.
 *
 * This calls `ClineCore.create()` which initialises the runtime host
 * (local SQLite, hub, or remote depending on options).
 */
export async function createClineAdapter(
  options: ClineAdapterOptions = {},
): Promise<ClineAdapter> {
  const core = await ClineCore.create({
    clientName: options.clientName ?? "agents-window",
    backendMode: options.backendMode ?? "auto",
  });

  return {
    core,

    async startSession(input: StartSessionInput) {
      const result = await core.start({
        config: {
          systemPrompt: "",
          enableTools: true,
          enableSpawnAgent: false,
          enableAgentTeams: false,
          cwd: process.cwd(),
          providerId: input.providerId ?? "",
          modelId: input.modelId ?? "",
        },
        source: (input.source ?? "web") as string,
        prompt: input.prompt,
        userImages: input.userImages,
      });

      return { sessionId: result.sessionId };
    },

    async sendPrompt(input: SendPromptInput) {
      await core.send({
        sessionId: input.sessionId,
        prompt: input.prompt,
        userImages: input.userImages,
      });
    },

    async readMessages(sessionId: string) {
      return core.readMessages(sessionId);
    },

    async listHistory(options) {
      const records = await core.listHistory({
        ...(options?.limit && { limit: options.limit }),
      });

      return records.map((record) => ({
        id: record.sessionId,
        title: record.metadata?.title ?? "Untitled",
        createdAt: record.startedAt,
        updatedAt: record.updatedAt,
        status: record.status,
        source: record.source,
      }));
    },

    subscribe(listener) {
      return core.subscribe(listener);
    },

    async deleteSession(sessionId: string) {
      return core.delete(sessionId);
    },

    async updateSession(sessionId: string, meta) {
      await core.update(sessionId, meta);
    },
  };
}
