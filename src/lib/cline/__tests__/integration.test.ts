/**
 * Integration tests — hit real filesystem and SDK.
 *
 * These tests require ~/.cline/data/sessions/ to exist.
 * Run with: pnpm test:integration
 */
import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Filesystem reader — against real data
// ---------------------------------------------------------------------------

import { listThreadsFromDisk, readSessionFromDisk } from "../session-reader";

describe("session-reader (integration)", () => {
  it("reads real sessions from disk", async () => {
    const threads = await listThreadsFromDisk();
    // We know there are 97+ sessions on this machine
    expect(threads.length).toBeGreaterThan(10);

    // Each thread should have the right shape
    for (const t of threads.slice(0, 5)) {
      expect(t.id).toBeTruthy();
      expect(typeof t.title).toBe("string");
      expect(typeof t.status).toBe("string");
      expect(typeof t.source).toBe("string");
    }
  });

  it("reads a real session's messages", async () => {
    const threads = await listThreadsFromDisk({ limit: 1 });
    expect(threads.length).toBe(1);

    const detail = await readSessionFromDisk(threads[0].id);
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe(threads[0].id);
    expect(detail!.title).toBe(threads[0].title);
    expect(Array.isArray(detail!.messages)).toBe(true);

    // At least some sessions have messages
    if (detail!.messages.length > 0) {
      const msg = detail!.messages[0];
      expect(["human", "ai", "tool"]).toContain(msg.type);
      expect(msg.content).toBeTruthy();
    }
  });

  it("returns null for nonexistent session", async () => {
    const result = await readSessionFromDisk("this-does-not-exist-12345");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ClineCore — SDK instantiation
// ---------------------------------------------------------------------------

import { ClineCore } from "@cline/sdk";

describe("ClineCore (integration)", () => {
  it("creates a local instance without crashing", async () => {
    const core = await ClineCore.create({
      clientName: "agents-window-integration-test",
      backendMode: "local",
    });
    expect(core).toBeDefined();
    expect(core.clientName).toBe("agents-window-integration-test");
  });

  it("lists history without crashing", async () => {
    const core = await ClineCore.create({
      clientName: "agents-window-integration-test",
      backendMode: "local",
    });
    // Local mode has its own DB — may be empty, but shouldn't throw
    const history = await core.listHistory({ limit: 5 });
    expect(Array.isArray(history)).toBe(true);
  });

  it("subscribe returns an unsubscribe function", async () => {
    const core = await ClineCore.create({
      clientName: "agents-window-integration-test",
      backendMode: "local",
    });
    const unsub = core.subscribe(() => {});
    expect(typeof unsub).toBe("function");
    unsub();
  });
});
