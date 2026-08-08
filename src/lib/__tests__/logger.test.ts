import { logger } from "../logger";
import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";

describe("Winston Logger Diagnostics", () => {
  it("creates structured JSON log entry correctly", async () => {
    const testMessage = "Test diagnostic logging entry";

    logger.info(testMessage, {
      threadId: "test-thread-id",
      category: "SSE_STREAM",
      metadata: { customField: "example" },
    });

    // Wait a brief moment for winston's DailyRotateFile transport filesystem flush
    await new Promise((resolve) => setTimeout(resolve, 400));

    // Resolve active timezone-local date filename
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;
    const logPath = path.join(
      process.cwd(),
      `.agents-window-diagnostics-${dateStr}.log`,
    );

    // Verify file creation and parse line JSON
    const content = await fs.readFile(logPath, "utf-8");
    const lines = content.trim().split("\n");
    const lastLine = JSON.parse(lines[lines.length - 1]);

    expect(lastLine.message).toBe(testMessage);
    expect(lastLine.threadId).toBe("test-thread-id");
    expect(lastLine.category).toBe("SSE_STREAM");
    expect(lastLine.metadata.customField).toBe("example");
    expect(lastLine.timestamp).toBeDefined();
  });
});
