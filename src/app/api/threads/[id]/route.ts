import { NextResponse } from "next/server";
import { readSessionFromDisk } from "@/lib/cline/session-reader";
import { logger } from "@/lib/logger";

/**
 * GET /api/threads/[id]
 *
 * Returns the full message history for one session.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id || id.length < 2) {
    return NextResponse.json({ error: "Invalid session ID" }, { status: 400 });
  }

  try {
    const session = await readSessionFromDisk(id);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json(session);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to read session";
    logger.error("Failed to read session", {
      category: "API_ROUTE",
      metadata: { error: message, sessionId: id },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
