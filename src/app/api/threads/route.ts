import { NextResponse } from "next/server";
import { createClineAdapter } from "@/lib/cline/adapter";

/**
 * GET /api/threads
 *
 * Returns a JSON list of Cline sessions mapped to the UI thread shape.
 * The adapter reads from ~/.cline/data/ and maps each session to
 * { id, title, createdAt, updatedAt, status, source }.
 */
export async function GET() {
  try {
    const adapter = await createClineAdapter();
    const threads = await adapter.listHistory();

    return NextResponse.json(threads);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list threads";
    console.error("[/api/threads] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
