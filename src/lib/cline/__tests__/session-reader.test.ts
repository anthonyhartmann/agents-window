import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const tempDir = mkdtempSync(join(tmpdir(), "cline-test-"));

vi.mock("node:os", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:os")>();
  return { ...orig, homedir: () => tempDir };
});

import { listThreadsFromDisk } from "../session-reader";

function createSession(id: string, data: Record<string, unknown>) {
  const dir = join(tempDir, ".cline", "data", "sessions", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, id + ".json"), JSON.stringify(data));
}

describe("listThreadsFromDisk", () => {
  it("returns empty array when no sessions dir", async () => {
    const threads = await listThreadsFromDisk();
    expect(Array.isArray(threads)).toBe(true);
  });

  it("lists sessions with correct fields", async () => {
    createSession("s1", {
      session_id: "s1",
      source: "cli",
      status: "completed",
      started_at: "2026-08-01T10:00:00Z",
      ended_at: "2026-08-01T11:00:00Z",
      prompt: "Hello world",
    });
    const threads = await listThreadsFromDisk();
    const s1 = threads.find((t) => t.id === "s1");
    expect(s1).toBeDefined();
    expect(s1!.title).toBe("Hello world");
    expect(s1!.status).toBe("completed");
    expect(s1!.source).toBe("cli");
  });

  it("uses metadata.title when available", async () => {
    createSession("s2", {
      session_id: "s2",
      metadata: { title: "My Session" },
      prompt: "Other",
    });
    const threads = await listThreadsFromDisk();
    const s2 = threads.find((t) => t.id === "s2");
    expect(s2!.title).toBe("My Session");
  });

  it("sorts by createdAt descending", async () => {
    createSession("old", { session_id: "old", started_at: "2026-01-01T00:00:00Z" });
    createSession("new", { session_id: "new", started_at: "2026-08-05T00:00:00Z" });
    const threads = await listThreadsFromDisk();
    const ids = threads.map((t) => t.id);
    expect(ids.indexOf("new")).toBeLessThan(ids.indexOf("old"));
  });

  it("respects limit", async () => {
    createSession("a", { session_id: "a", started_at: "2026-08-01Z" });
    createSession("b", { session_id: "b", started_at: "2026-08-02Z" });
    createSession("c", { session_id: "c", started_at: "2026-08-03Z" });
    const threads = await listThreadsFromDisk({ limit: 2 });
    expect(threads).toHaveLength(2);
  });

  it("skips invalid manifest files", async () => {
    createSession("good", { session_id: "good", started_at: "2026-08-01Z" });
    const badDir = join(tempDir, ".cline", "data", "sessions", "bad");
    mkdirSync(badDir, { recursive: true });
    writeFileSync(join(badDir, "bad.json"), "not json!");
    const threads = await listThreadsFromDisk();
    expect(threads.find((t) => t.id === "good")).toBeDefined();
    expect(threads.find((t) => t.id === "bad")).toBeUndefined();
  });
});
