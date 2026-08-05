import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../route";

vi.mock("@/lib/cline/session-reader", () => ({
  listThreadsFromDisk: vi.fn(),
}));

import { listThreadsFromDisk } from "@/lib/cline/session-reader";

const mockList = vi.mocked(listThreadsFromDisk);

beforeEach(() => {
  mockList.mockReset();
});

describe("GET /api/threads", () => {
  it("returns 200 with thread list", async () => {
    mockList.mockResolvedValue([
      {
        id: "s1",
        title: "Test session",
        createdAt: "2026-08-01T10:00:00Z",
        updatedAt: "2026-08-01T11:00:00Z",
        status: "completed",
        source: "cli",
      },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("s1");
    expect(body[0].title).toBe("Test session");
    expect(mockList).toHaveBeenCalledOnce();
  });

  it("returns 200 with empty array when no sessions", async () => {
    mockList.mockResolvedValue([]);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual([]);
  });

  it("returns 500 when reader throws", async () => {
    mockList.mockRejectedValue(new Error("Disk unreadable"));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Disk unreadable");
  });

  it("returns 500 with generic message for non-Error throws", async () => {
    mockList.mockRejectedValue("something weird");

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Failed to list threads");
  });
});
