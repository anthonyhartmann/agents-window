# Plan S - Step 7: File Upload & Attachment Serialization E2E

This document details **Step 7** of the S-tier roadmap: implementing a Playwright
E2E test suite to verify file upload, Base64 attachment serialization, previewing
the attachment, and ensuring the outbound stream payload includes the serialized
attachment details.

---

## 1. Development Work

Ensure the file upload buttons and preview states have precise `data-testid`
attributes to enable stable, reliable E2E tests:

- File input (hidden or styled): `data-testid="file-upload-input"` or
  `type="file"`
- Attachment trigger/button: `data-testid="file-upload-button"`
- Attachment preview list: `data-testid="attachment-preview-list"`
- Single attachment thumbnail/preview item:
  `data-testid="attachment-preview-item"`
- Attachment name label: `data-testid="attachment-name"`

---

## 2. Testing Work

We will append the File Upload test cases to the E2E test file
`tests/chat-e2e.spec.ts`.

### Create or extend E2E test file (`tests/chat-e2e.spec.ts`)

```typescript
import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

test.describe("File Upload & Attachment Serialization", () => {
  test("uploading a file serializes to Base64 and shows thumbnail preview", async ({ page }) => {
    // 1. Arrange: Navigate to chat session
    await page.goto("/?threadId=new-file-thread");

    // Locate file input
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached();

    // Create a dummy text file to upload
    const dummyFilePath = path.join(__dirname, "dummy-upload.txt");
    fs.writeFileSync(dummyFilePath, "This is a dummy upload content.");

    // 2. Act: Select/upload file
    await fileInput.setInputFiles(dummyFilePath);

    // 3. Assert: Verify the thumbnail preview displays the uploaded file name
    const previewItem = page.locator('[data-testid="attachment-preview-item"]').first();
    await expect(previewItem).toBeVisible();

    const fileNameLabel = previewItem.locator('[data-testid="attachment-name"]');
    await expect(fileNameLabel).toContainText("dummy-upload.txt");

    // Clean up temporary local test file
    fs.unlinkSync(dummyFilePath);
  });
});
```

---

## 3. Verification & Meta-Testing

To complete this step, run the following verification steps:

### A. Run Integration Test
Start the local server and execute the Playwright test suite:
```bash
pnpm exec playwright test tests/chat-e2e.spec.ts -g "File Upload"
```

### B. Meta-Testing Sabotage Check
We must verify our E2E tests are robust and catch file attachment bugs:
1. Open the file upload hook/component (e.g. `src/hooks/use-file-upload.tsx`).
2. Inject a sabotage: Temporarily disable or break the Base64 conversion
   pipeline (e.g., bypass adding file objects to the attachments state or keep
   the list empty).
3. Run the Playwright test suite command again.
4. **Confirm Failure**: Verify that the integration test fails because the
   `attachment-preview-item` is never rendered or remains invisible.
5. Revert the sabotage and confirm the test suite passes cleanly again.
