import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../route";

vi.mock("@/lib/cline/session-reader", () => ({
  readSessionFromDisk: vi.fn(),
}));

import { readSessionFromDisk } from "@/lib/cline/session-reader";

const mockRead = vi.mocked(readSessionFromDisk);

beforeEach(() => {
  mockRead.mockReset();
});

function makeRequest(id: string) {
  return new Request(`http://localhost:3000/api/threads/${id}`);
}

describe("GET /api/threads/[id]", () => {
  it("returns 200 with session detail", async () => {
    mockRead.mockResolvedValue({
      id: "s1",
      title: "My Session",
      createdAt: "2026-08-01T10:00:00Z",
      updatedAt: "2026-08-01T11:00:00Z",
      status: "completed",
      source: "cli",
      messages: [
        { type: "human", content: "Hello" },
        { type: "ai", content: "Hi there!" },
      ],
    });

    const res = await GET(makeRequest("s1"), {
      params: Promise.resolve({ id: "s1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe("s1");
    expect(body.title).toBe("My Session");
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].type).toBe("human");
    expect(body.messages[1].type).toBe("ai");
  });

  it("returns 404 for unknown session", async () => {
    mockRead.mockResolvedValue(null);

    const res = await GET(makeRequest("nonexistent"), {
      params: Promise.resolve({ id: "nonexistent" }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Session not found");
  });

  it("returns 400 for short/empty ID", async () => {
    const res = await GET(makeRequest(""), {
      params: Promise.resolve({ id: "" }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid session ID");
  });

  it("returns 500 when reader throws", async () => {
    mockRead.mockRejectedValue(new Error("Disk failure"));

    const res = await GET(makeRequest("s1"), {
      params: Promise.resolve({ id: "s1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Disk failure");
  });

  it("returns session with empty messages", async () => {
    mockRead.mockResolvedValue({
      id: "s2",
      title: "Empty",
      createdAt: "",
      updatedAt: "",
      status: "running",
      source: "web",
      messages: [],
    });

    const res = await GET(makeRequest("s2"), {
      params: Promise.resolve({ id: "s2" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.messages).toEqual([]);
  });
});
