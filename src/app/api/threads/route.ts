import { NextResponse } from "next/server";
import { listThreadsFromDisk } from "@/lib/cline/session-reader";

/**
 * GET /api/threads
 *
 * Returns a JSON list of Cline sessions mapped to the UI thread shape.
 * Reads directly from ~/.cline/data/sessions/ filesystem — no full
 * ClineCore runtime needed for this read-only endpoint.
 */
export async function GET() {
  try {
    const threads = await listThreadsFromDisk();
    return NextResponse.json(threads);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list threads";
    console.error("[/api/threads] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
