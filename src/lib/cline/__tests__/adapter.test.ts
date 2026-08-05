import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockStart,
  mockSend,
  mockReadMessages,
  mockListHistory,
  mockSubscribe,
  mockDelete,
  mockUpdate,
} = vi.hoisted(() => ({
  mockStart: vi.fn(),
  mockSend: vi.fn(),
  mockReadMessages: vi.fn(),
  mockListHistory: vi.fn(),
  mockSubscribe: vi.fn(),
  mockDelete: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock("@cline/sdk", () => ({
  ClineCore: {
    create: vi.fn().mockResolvedValue({
      start: mockStart,
      send: mockSend,
      readMessages: mockReadMessages,
      listHistory: mockListHistory,
      subscribe: mockSubscribe,
      delete: mockDelete,
      update: mockUpdate,
    }),
  },
}));

import { createClineAdapter } from "../adapter";
import { ClineCore } from "@cline/sdk";

let adapter: Awaited<ReturnType<typeof createClineAdapter>>;

beforeEach(async () => {
  vi.clearAllMocks();
  adapter = await createClineAdapter();
});

describe("createClineAdapter", () => {
  it("creates ClineCore with default options", () => {
    expect(ClineCore.create).toHaveBeenCalledWith({
      clientName: "agents-window",
      backendMode: "auto",
    });
  });

  it("passes custom options", async () => {
    vi.mocked(ClineCore.create).mockClear();
    await createClineAdapter({ clientName: "my-app", backendMode: "local" });
    expect(ClineCore.create).toHaveBeenCalledWith({
      clientName: "my-app",
      backendMode: "local",
    });
  });

  it("startSession calls core.start and returns sessionId", async () => {
    mockStart.mockResolvedValue({ sessionId: "sess-123" });

    const result = await adapter.startSession({
      prompt: "Hello",
      providerId: "anthropic",
      modelId: "claude-sonnet",
      source: "web",
    });

    expect(result).toEqual({ sessionId: "sess-123" });
    expect(mockStart).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Hello",
        source: "web",
        config: expect.objectContaining({
          providerId: "anthropic",
          modelId: "claude-sonnet",
          systemPrompt: "",
          enableTools: true,
        }),
      }),
    );
  });

  it("sendPrompt calls core.send", async () => {
    mockSend.mockResolvedValue(undefined);

    await adapter.sendPrompt({
      sessionId: "sess-123",
      prompt: "Continue",
      userImages: ["base64data"],
    });

    expect(mockSend).toHaveBeenCalledWith({
      sessionId: "sess-123",
      prompt: "Continue",
      userImages: ["base64data"],
    });
  });

  it("readMessages calls core.readMessages", async () => {
    const msgs = [{ role: "user", content: "hi" }];
    mockReadMessages.mockResolvedValue(msgs);

    const result = await adapter.readMessages("sess-123");

    expect(result).toEqual(msgs);
    expect(mockReadMessages).toHaveBeenCalledWith("sess-123");
  });

  it("listHistory maps records to ThreadSummary", async () => {
    mockListHistory.mockResolvedValue([
      {
        sessionId: "s1",
        startedAt: "2026-08-01T10:00:00Z",
        updatedAt: "2026-08-01T11:00:00Z",
        status: "completed",
        source: "cli",
        metadata: { title: "My Session" },
      },
    ]);

    const result = await adapter.listHistory();

    expect(result).toEqual([
      {
        id: "s1",
        title: "My Session",
        createdAt: "2026-08-01T10:00:00Z",
        updatedAt: "2026-08-01T11:00:00Z",
        status: "completed",
        source: "cli",
      },
    ]);
  });

  it("listHistory defaults title to Untitled", async () => {
    mockListHistory.mockResolvedValue([
      {
        sessionId: "s2",
        startedAt: "2026-08-01T10:00:00Z",
        updatedAt: "2026-08-01T10:00:00Z",
        status: "idle",
        source: "cli",
        metadata: {},
      },
    ]);

    const result = await adapter.listHistory();
    expect(result[0].title).toBe("Untitled");
  });

  it("listHistory passes limit option", async () => {
    mockListHistory.mockResolvedValue([]);

    await adapter.listHistory({ limit: 10 });

    expect(mockListHistory).toHaveBeenCalledWith({ limit: 10 });
  });

  it("subscribe delegates to core.subscribe", () => {
    const unsub = vi.fn();
    mockSubscribe.mockReturnValue(unsub);

    const listener = vi.fn();
    const result = adapter.subscribe(listener);

    expect(mockSubscribe).toHaveBeenCalledWith(listener);
    expect(result).toBe(unsub);
  });

  it("deleteSession calls core.delete", async () => {
    mockDelete.mockResolvedValue(true);

    const result = await adapter.deleteSession("sess-123");

    expect(result).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith("sess-123");
  });

  it("updateSession calls core.update", async () => {
    mockUpdate.mockResolvedValue(undefined);

    await adapter.updateSession("sess-123", { title: "New Title" });

    expect(mockUpdate).toHaveBeenCalledWith("sess-123", { title: "New Title" });
  });
});
