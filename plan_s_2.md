# Plan S - Step 2: Production Diagnostics Logging via Winston

This document details **Step 2** of the S-tier roadmap: establishing a robust,
production-grade structured logging setup using **Winston** and
`winston-daily-rotate-file`.

---

## 1. Development Work

### A. Dependency Installation
Run the following package manager command:
```bash
pnpm install winston winston-daily-rotate-file
```

### B. Create Logger Instance (`src/lib/logger.ts`)
Create a single logging configuration that writes to a local rotating file.

```typescript
import winston from "winston";
import "winston-daily-rotate-file";
import path from "path";

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

export const logger = winston.createLogger({
  level: "info",
  format: logFormat,
  transports: [
    new winston.transports.DailyRotateFile({
      filename: path.join(process.cwd(), ".agents-window-diagnostics-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxSize: "5m",       // Rotate log files when they reach 5MB
      maxFiles: "3",       // Keep at most 3 rotated log files
      zippedArchive: true, // Compress rotated log files
    })
  ]
});
```

### C. Logging Instrumentation Example (`src/app/api/chat/stream/route.ts`)
Add logging events to track connection lifecycle, stream inputs, and errors:

```typescript
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  logger.info("SSE Stream requested", {
    category: "API_ROUTE",
    metadata: { url: request.url }
  });

  // inside try-catch block:
  } catch (error) {
    logger.error("SSE stream failed", {
      category: "SSE_STREAM",
      metadata: { error: error instanceof Error ? error.message : String(error) }
    });
  }
}
```

---

## 2. Testing Work

We will write a unit test to verify that the Winston logger correctly creates and
rotates files, and outputs valid, parseable JSON lines conforming to our schema.

### Create test file (`src/lib/__tests__/logger.test.ts`)
```typescript
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
      metadata: { customField: "example" }
    });

    // Wait a brief moment for winston's DailyRotateFile transport filesystem flush
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Resolve active date filename
    const dateStr = new Date().toISOString().split("T")[0];
    const logPath = path.join(process.cwd(), `.agents-window-diagnostics-${dateStr}.log`);

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
```

---

## 3. Verification & Meta-Testing

To complete this step, run the following verification steps:

### A. Run Test Suite
Run the test runner to confirm Winston is functioning cleanly:
```bash
pnpm test src/lib/__tests__/logger.test.ts
```

### B. Meta-Testing Sabotage Check
We must verify our logging test catches configurations failures:
1. Open `src/lib/logger.ts`.
2. Sabotage the format block (e.g. remove `winston.format.json()` so it logs
   in plain text instead of structured JSON).
3. Run the test suite again.
4. **Confirm Failure**: Verify that the unit test fails because `JSON.parse`
   cannot parse plain text lines, throwing a JSON SyntaxError. If the test passes,
   the test is invalid.
5. Revert the sabotage and confirm the test suite passes cleanly again.
