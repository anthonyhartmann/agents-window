# agents-window — Milestone-Driven Build Plan

> This document rewrites the tech spec as a series of human checkpoints.  
> **Rule:** if a milestone is not tested, it is not done. Every milestone includes a test plan that is at least 50% of its content.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| 🧍 **Human checkpoint** | You (the human) should stop here, inspect the output, and approve before I continue. |
| 🧪 **Test gate** | A concrete test or command that must pass before the milestone is complete. |
| ⚠️ **If this breaks** | Common failure mode and how we debug it. |
| 🚪 **Exit criteria** | What must be true to leave this milestone. |

---

## Milestone 0 — Repo Bootstrap & Toolchain Verification

**Goal:** The `agent-chat-ui` fork is cloned, the toolchain is verified, `@cline/sdk` is linked, and the dev server starts cleanly.

> **Adjustment from original plan:** Removing the LangGraph packages immediately forces a full rewrite of the data layer before the app can even compile. I am keeping LangGraph deps in `package.json` for now and will remove them **only after** their call sites have been replaced in later milestones. This keeps every milestone testable.

### What I will do
1. Clone the `agent-chat-ui` repo into this workspace.
2. Keep existing LangGraph packages in `package.json` until their consumers are rewritten.
3. Add `@cline/sdk` as a `file:` dependency pointing to the global Cline install.
4. Add a `typecheck` script (`tsc --noEmit`).
5. Run `pnpm install` and fix any install-time issues.
6. Run `pnpm typecheck`.
7. Start `pnpm dev`.

### 🧍 Human checkpoint
- Open `package.json` and confirm `@cline/sdk` is referenced as a `file:` dependency.
- Confirm the dependency path matches your local Cline install.
- Confirm LangGraph packages are still present (they will be removed incrementally).

### 🧪 Test plan
| # | Test | Command / Action | Pass criteria |
|---|------|------------------|---------------|
| 0.1 | Clean install | `pnpm install` | Exits 0. |
| 0.2 | Type gate | `pnpm typecheck` | Zero type errors. |
| 0.3 | Dev server | `WATCHPACK_POLLING=true pnpm dev` | Next.js starts on `localhost:3000` with no runtime errors. |
| 0.4 | Smoke page | `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` | Returns `200` (page renders; no 404/500). |
| 0.5 | SDK link | `pnpm ls @cline/sdk` | Shows the `file:` link to the global SDK. |

### ⚠️ If this breaks
- **`@cline/sdk` file path invalid:** I will stop and ask you to confirm the path rather than guess.
- **Node version mismatch:** verify Node 22.22.1 is active (`~/.asdf/shims/node -v`).
- **EMFILE / too many open files on macOS:** use `WATCHPACK_POLLING=true pnpm dev` until file-descriptor limits can be raised.

### 🚪 Exit criteria
- `pnpm typecheck` passes.
- `pnpm dev` serves a non-error page on `localhost:3000`.
- `@cline/sdk` is linked via `file:`.
- No new LangGraph imports are introduced.

---

## Milestone 1 — Cline SDK Adapter & Type Contract

**Goal:** A single, typed adapter module isolates the app from the semi-private Cline SDK. Message/event mappers are unit-tested.

### What I will do
1. Create the adapter module:
   - `lib/cline/adapter.ts` — wraps `ClineCore` construction, `start()`, `send()`, `subscribe()`.
   - `lib/cline/cline-types.ts` — narrow interfaces for SDK inputs/outputs.
   - `lib/cline/map-events.ts` — maps Cline `AgentEvent`s to LangGraph-compatible stream chunks.
   - `lib/cline/map-messages.ts` — maps persisted Cline messages to UI messages.
2. Add unit tests for the mappers using representative SDK event fixtures.
3. Verify the adapter can instantiate `ClineCore` without crashing.

### 🧍 Human checkpoint
- Read `lib/cline/adapter.ts` and confirm the SDK is imported only there.
- Read a few mapper tests and confirm the event fixtures look like real Cline events you’ve seen.

### 🧪 Test plan
| # | Test | Command / Action | Pass criteria |
|---|------|------------------|---------------|
| 1.1 | Adapter unit tests | `pnpm test lib/cline/adapter.test.ts` (or vitest/jest) | All tests pass. If no test runner exists, I will add one. |
| 1.2 | Mapper unit tests | `pnpm test lib/cline/map-events.test.ts` | Every Cline event type maps to a defined UI shape; unknown events map to no-op or system message without throwing. |
| 1.3 | Type gate | `pnpm typecheck` | No `any` in new adapter code; SDK interactions are typed through the adapter. |
| 1.4 | Instantiation smoke | Run a small script that imports the adapter and calls `createClineCore()` | Does not throw; returns an object with expected methods. |
| 1.5 | Dependency isolation audit | Search `app/`, `components/`, `hooks/` for direct `@cline/sdk` imports | Only `lib/cline/adapter.ts` imports the SDK. |

### ⚠️ If this breaks
- **`ClineCore` constructor signature unknown:** I will inspect the SDK source in `node_modules/@cline/sdk` and define a matching interface, then cast.
- **Event shape mismatch:** I will add the fixture to the test file first, then fix the mapper.
- **Missing test runner:** I will install and configure `vitest` with `pnpm`.

### 🚪 Exit criteria
- Adapter and mappers exist, are typed, and have passing unit tests.
- No SDK imports outside `lib/cline/`.

---

## Milestone 2 — Thread List API

**Goal:** `GET /api/threads` returns a JSON list of Cline sessions, mapped to the UI thread shape.

### What I will do
1. Implement `app/api/threads/route.ts`:
   - Calls adapter to list sessions from the Cline store (`~/.cline/data/`).
   - Maps each session to `{ id, title, createdAt, updatedAt }`.
   - Handles errors with a 500 + plain message.
2. Keep the route thin; all store logic lives in the adapter.

### 🧍 Human checkpoint
- Use `curl` (provided below) and confirm the returned JSON matches sessions you can see in `~/.cline/data/sessions/`.

### 🧪 Test plan
| # | Test | Command / Action | Pass criteria |
|---|------|------------------|---------------|
| 2.1 | Empty list | `curl -s http://localhost:3000/api/threads` | Returns `[]` or valid array when no sessions exist. |
| 2.2 | Populated list | Run after you have at least one Cline session | Returns array of threads; `id` and `title` are non-empty strings. |
| 2.3 | Field shape | Inspect JSON from 2.2 | Each item has `id`, `title`, `createdAt`, `updatedAt` strings. |
| 2.4 | Error path | Temporarily move `~/.cline/data/` aside, call API, restore | Returns 500 with a readable error message; server does not crash. |
| 2.5 | Type gate | `pnpm typecheck` | Route is typed; response shape is inferred. |

### ⚠️ If this breaks
- **Empty list when sessions exist:** adapter is reading wrong path; I will log the resolved data directory and compare to `~/.cline/data/`.
- **Wrong date formats:** I will pin ISO strings and add a snapshot test.
- **500 without message:** I will add try/catch and plain error response.

### 🚪 Exit criteria
- `GET /api/threads` returns correct JSON for empty and populated stores.
- Error case is graceful.

---

## Milestone 3 — Thread Detail API

**Goal:** `GET /api/threads/[id]` returns the full message history for one session.

### What I will do
1. Implement `app/api/threads/[id]/route.ts`:
   - Loads session by `id` via adapter.
   - Maps messages through `map-messages.ts`.
   - Returns `{ id, title, messages }`.
2. Add a 404 path for unknown IDs.

### 🧍 Human checkpoint
- Pick a real session ID from `~/.cline/data/sessions/` or from Milestone 2.
- Call the endpoint and verify the returned messages look like the conversation you remember.

### 🧪 Test plan
| # | Test | Command / Action | Pass criteria |
|---|------|------------------|---------------|
| 3.1 | Valid thread | `curl -s http://localhost:3000/api/threads/<real-id>` | Returns 200; JSON has `id`, `title`, `messages` array. |
| 3.2 | Message shape | Inspect JSON from 3.1 | Each message has `id`, `role` (`user`/`assistant`/`system`), `content`, and optional `tool_calls`. |
| 3.3 | Unknown thread | `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/threads/does-not-exist` | Returns 404. |
| 3.4 | Malformed ID | `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/threads/!!!` | Returns 400 or 404, not 500. |
| 3.5 | UI hook prep | Verify `lib/cline/map-messages.ts` has a unit test for each persisted message role | Tests pass. |

### ⚠️ If this breaks
- **Messages out of order:** I will check the adapter sort key against `created_at` or sequence index.
- **Tool calls missing:** I will inspect raw Cline message and fix `map-messages.ts`; update unit test.
- **Session ID not matching file names:** I will trace the ID source (DB row vs directory name) and document it.

### 🚪 Exit criteria
- Valid threads return correctly mapped history.
- Invalid IDs return 404.
- Mapper unit tests cover all roles.

---

## Milestone 4 — SSE Stream API

**Goal:** `POST /api/chat/stream` starts a Cline session and streams `AgentEvent`s to the browser as SSE.

### What I will do
1. Implement `app/api/chat/stream/route.ts`:
   - Accepts JSON `{ message, threadId?, attachments? }`.
   - Starts or resumes a session through the adapter.
   - Subscribes to events and writes SSE lines:
     ```
     event: message\n
     data: {"type":"content","content":"..."}\n\n
     ```
   - Closes the stream on terminal events (`ended`, `done`, `error`).
2. Add body-size config for attachments.

### 🧍 Human checkpoint
- Run the `curl` test below and watch SSE lines arrive in your terminal.
- Confirm you see content events and a final `event: done` or `event: ended`.

### 🧪 Test plan
| # | Test | Command / Action | Pass criteria |
|---|------|------------------|---------------|
| 4.1 | SSE headers | `curl -N -H "Accept: text/event-stream" -H "Content-Type: application/json" -d '{"message":"say hello"}' http://localhost:3000/api/chat/stream` | Response headers include `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`. |
| 4.2 | New session stream | Run 4.1 | Stream emits `event:` lines; `data:` is valid JSON; stream ends with a terminal event. |
| 4.3 | Resume session | `curl -N ... -d '{"message":"and goodbye","threadId":"<id-from-m2>"}'` | Continues existing session; no new directory created in `~/.cline/data/sessions/`. |
| 4.4 | No buffering | Observe Network tab / curl output | Events appear as they arrive, not all at the end. |
| 4.5 | Error handling | `curl -N ... -d '{"message":""}'` or invalid JSON | Returns 400 or 500 with plain text; stream does not hang. |

---

## Milestone 5 — Frontend Stream Hook

**Goal:** A React hook consumes the SSE endpoint and accumulates messages, loading states, and errors.

### What I will do
1. Create `lib/hooks/useClineStream.ts`:
   - Opens `EventSource` or uses `fetch` + `ReadableStream` parser.
   - Parses SSE lines and accumulates messages.
   - Tracks `isLoading`, `error`, and `threadId`.
2. Provide a mock-SSE test fixture so the hook can be tested without the backend.

### 🧍 Human checkpoint
- Review the hook’s public API (`messages`, `isLoading`, `error`, `sendMessage`).
- Confirm it matches what the existing chat UI components expect.

### 🧪 Test plan
| # | Test | Command / Action | Pass criteria |
|---|------|------------------|---------------|
| 5.1 | Hook unit test | `pnpm test lib/hooks/useClineStream.test.ts` | Hook accumulates text deltas into messages. |
| 5.2 | Tool-call accumulation | Same test with a fixture containing tool-call events | Hook builds `tool_calls` arrays with `id`, `name`, `args`. |
| 5.3 | Error state | Test with an SSE `event: error` fixture | Hook surface `error` and stops loading. |
| 5.4 | Resume thread | Test calling `sendMessage` with an existing `threadId` | Hook preserves prior messages and appends new ones. |
| 5.5 | Cleanup | Test unmounting while stream is open | EventSource / reader is aborted; no memory-leak warnings. |
| 5.6 | Type gate | `pnpm typecheck` | Hook returns typed state. |

### ⚠️ If this breaks
- **Messages duplicate:** accumulator key collision; I will add deterministic IDs.
- **Tool calls never complete:** partial chunks not merged; I will buffer by `tool_call_id`.
- **Hook incompatible with existing UI:** I will adjust the return shape to match `useStream` from Agent Chat UI.

### 🚪 Exit criteria
- Hook has passing unit tests for content, tool calls, errors, and cleanup.
- Public API is stable.

---

## Milestone 6 — End-to-End Chat Integration

**Goal:** Typing in the chat input hits the real API, streams a response, and displays it in the existing message list.

### What I will do
1. Replace the LangGraph `useStream` usage with `useClineStream` in the chat page/components.
2. Wire the submit handler to `POST /api/chat/stream`.
3. Keep existing UI components (bubbles, input, scroll) unchanged.

### 🧍 Human checkpoint
- Type a simple message in the UI and watch the assistant reply stream in.
- Open browser DevTools Network tab and confirm SSE events are arriving.

### 🧪 Test plan
| # | Test | Command / Action | Pass criteria |
|---|------|------------------|---------------|
| 6.1 | Happy path | Type "hello" in UI, submit | Assistant message appears and content grows as it streams. |
| 6.2 | Network verification | DevTools → Network → `/api/chat/stream` | Request is `POST`; response type is `event-stream`; events appear in real time. |
| 6.3 | Scroll behavior | Send a long message or receive a long reply | Chat auto-scrolls to bottom; user can scroll up. |
| 6.4 | New thread created | Check `~/.cline/data/sessions/` after first message | A new session directory/row exists. |
| 6.5 | Reload persistence | Reload the page at the same `?threadId=...` | Messages reload from `GET /api/threads/[id]`. |
| 6.6 | Type gate | `pnpm typecheck` | Zero errors. |

### ⚠️ If this breaks
- **Submit does nothing:** handler not wired; I will check the onSubmit path.
- **Stream starts but UI blank:** message shape mismatch; I will compare hook output to component props.
- **UI re-renders constantly:** state updates per chunk are not batched; I will throttle or memoize.

### 🚪 Exit criteria
- Real chat works end-to-end.
- Reloading restores the thread.

---

## Milestone 7 — Thread Sidebar & Thread Selection

**Goal:** The sidebar lists threads from `GET /api/threads` and selecting one updates the URL and loads history.

### What I will do
1. Replace LangGraph thread provider with calls to `/api/threads`.
2. Use `nuqs` to keep `threadId` in URL query state.
3. Update the thread list after a new message creates a thread.

### 🧍 Human checkpoint
- Look at the sidebar and confirm your existing Cline sessions appear.
- Click one and confirm the main panel loads the correct history.

### 🧪 Test plan
| # | Test | Command / Action | Pass criteria |
|---|------|------------------|---------------|
| 7.1 | Sidebar list | Load `/` | Sidebar shows threads with titles and timestamps. |
| 7.2 | Selection | Click a thread | URL changes to `?threadId=...`; main panel shows messages. |
| 7.3 | New thread appears | Send a new message from root `/` | New thread appears at the top of the sidebar without a manual refresh. |
| 7.4 | Empty state | Delete/move all sessions temporarily | Sidebar shows empty state; no crash. |
| 7.5 | URL sync | Manually visit `/?threadId=<id>` | Correct thread loads and sidebar highlights it. |


---

## Milestone 8 — Tool Call Rendering

**Goal:** When Cline emits tool calls (bash, editor, read, etc.), they render inline using the existing tool-call UI components.

### What I will do
1. Ensure `map-events.ts` produces `tool_calls` arrays matching the component contract:
   - `{ id, type: "function", function: { name, arguments } }`
2. Add fixture tests for each Cline tool type.
3. Verify the existing `ToolCall` component receives the right props.

### 🧍 Human checkpoint
- Ask Cline in the UI to read a file or run a shell command.
- Confirm a tool-call card appears with the tool name and arguments, then the result.

### 🧪 Test plan
| # | Test | Command / Action | Pass criteria |
|---|------|------------------|---------------|
| 8.1 | Mapper fixture tests | `pnpm test lib/cline/map-events.test.ts` | Each known tool (`bash`, `editor`, `read_file`, `search_files`, etc.) maps correctly. |
| 8.2 | Unknown tool | Add fixture for an unrecognized tool name | Maps without crash; renders as generic tool call. |
| 8.3 | UI manual test | Prompt: "Read the contents of README.md" | Tool-call card appears; argument shows target file. |
| 8.4 | Tool result | After tool executes | Result / output appears below or replaces the call. |
| 8.5 | Multiple calls | Prompt that triggers 2+ tools | Each call has a unique `id`; all render. |

### ⚠️ If this breaks
- **Tool calls not rendered:** shape mismatch; I will compare hook output to component’s expected props.
- **Duplicate IDs:** I will namespace IDs with session + index.
- **Arguments not pretty-printed:** existing UI may expect a string; I will JSON-stringify objects in the mapper.

### 🚪 Exit criteria
- Known Cline tools render inline.
- Unknown tools do not crash.
- Mapper tests cover all tool types.

---

## Milestone 9 — File Upload / `userImages`

**Goal:** Users can attach images/files; attachments are passed to Cline as `userImages`.

### What I will do
1. Add file input to the chat input component.
2. In the submit handler, read files as base64/data URL and include them in the `POST /api/chat/stream` payload.
3. Update the API route to forward attachments to the adapter.
4. Increase body-size limit in the route.

### 🧍 Human checkpoint
- Drag or select an image, send a message, and confirm Cline “sees” the image.

### 🧪 Test plan
| # | Test | Command / Action | Pass criteria |
|---|------|------------------|---------------|
| 9.1 | Upload UI | Click attachment button / drag image | File appears as a chip in the input. |
| 9.2 | Small image | Upload a <1MB PNG and ask “describe this” | Cline responds to image content. |
| 9.3 | Large image | Upload a 5MB+ image | Request succeeds after body-size limit increase. |
| 9.4 | Multiple files | Upload 2 images | Both are forwarded; Cline can reference both. |
| 9.5 | API payload | Inspect request body in DevTools | `attachments` array is present and correctly encoded. |
| 9.6 | Persistence | Check session data | Attachment metadata is persisted alongside the message. |

### ⚠️ If this breaks
- **Upload fails with 413:** body-size limit too low; I will raise route config.
- **Cline ignores image:** adapter not passing `userImages`; I will inspect SDK method signature.
- **Base64 too large:** I will consider file-path references for local files instead of inlining.

### 🚪 Exit criteria
- Image upload works end-to-end.
- Body size is configured for multi-MB files.


---

## Milestone 10 — Persistence, Cross-Client Sync & Final Polish

**Goal:** Web-created sessions are visible to Cline CLI/IDE; existing sessions are visible in the web UI; UI branding and dark mode are correct.

### What I will do
1. Remove the LangGraph setup/agent-selection form.
2. Apply Cline branding (title, favicon, empty states).
3. Verify dark mode class and scroll-to-bottom behavior.
4. Confirm session files in `~/.cline/data/sessions/` are readable by Cline CLI.

### 🧍 Human checkpoint
- Open the Cline CLI or VS Code extension and confirm a session started in the web UI appears there.
- Toggle dark/light mode and confirm the chat UI responds.

### 🧪 Test plan
| # | Test | Command / Action | Pass criteria |
|---|------|------------------|---------------|
| 10.1 | Web → CLI sync | Start session in web UI; open Cline CLI | Session is listed and loadable. |
| 10.2 | CLI → Web sync | Start session in Cline CLI; reload web sidebar | Session appears in sidebar. |
| 10.3 | Session directory audit | `ls ~/.cline/data/sessions/` | Each web session has a directory/entry; no corruption. |
| 10.4 | Dark mode | Toggle system/ UI dark mode | Chat background, bubbles, and sidebar update. |
| 10.5 | Scroll-to-bottom | Send long reply | View stays at bottom unless user scrolls up. |
| 10.6 | Branding | Inspect `<title>` and header | Title contains "agents-window" / Cline branding; no LangGraph logos. |
| 10.7 | Full type gate | `pnpm typecheck` | Zero errors. |
| 10.8 | Production build | `pnpm build` | Build succeeds with no errors. |

### ⚠️ If this breaks
- **Web session not in CLI:** adapter wrote metadata the CLI does not expect; I will compare JSON schemas.
- **CLI session not in web:** adapter filter too restrictive; I will remove filters.
- **Build fails:** likely a dynamic import or server/client mismatch; I will trace the error.

### 🚪 Exit criteria
- Bidirectional session sync works.
- Build passes.
- UI is branded and theme-aware.

---

## Global Test Gates (Run Before Every Milestone Advance)

After every milestone, the following must remain true:

1. `pnpm typecheck` — zero errors.
2. `pnpm dev` — starts and serves the page.
3. No LangGraph dependencies in `package.json` or source.
4. No direct `@cline/sdk` imports outside `lib/cline/`.
5. No raw SQL against `~/.cline/data/db/sessions.db`.

---

## Rollback & Incident Drill

If any milestone leaves the repo broken, the recovery order is:

1. Run `pnpm typecheck` and capture the first error.
2. Revert files introduced in the current milestone using git.
3. Confirm the previous milestone still passes its test plan.
4. Re-approach the failed milestone with a smaller change and a new test.

---

## Open Questions to Resolve Before Milestone 1

These block safe adapter design:

1. What is the exact filesystem path to the global `@cline/sdk` on this machine?
2. Does `ClineCore` expose `subscribe`, or does it use a different event mechanism?
3. What is the exact `AgentEvent` schema in the installed SDK version?
4. Does `ClineCore.start()` accept attachments, or must images be injected into the prompt text?
5. Should the web UI show *all* Cline sessions, or filter by a `source` tag (e.g., `source=web`)?

---

## Milestone 11 — Remove Unused LangGraph Code

**Goal:** Strip all dead LangGraph imports, dependencies, and boilerplate that are no longer wired up.

### What I will do
1. Run `grep -r '@langchain' src/` to find every remaining LangGraph import.
2. For each file: check if the import is actually used. If not, remove it.
3. Remove unused LangGraph packages from `package.json`: `@langchain/langgraph-sdk`, `@langchain/core`, `@langchain/langgraph`, `langgraph-nextjs-api-passthrough`.
4. Run `pnpm install` to clean the lockfile.
5. Delete orphaned files: `src/providers/client.ts`, `src/lib/ensure-tool-responses.ts`, `src/lib/agent-inbox-interrupt.ts`, `src/lib/multimodal-utils.ts`, `src/components/icons/langgraph.tsx`, `src/app/api/[..._path]/route.ts` (the LangGraph proxy).
6. Run `pnpm typecheck`, `pnpm test`, `pnpm build`.

### 🧪 Test plan
| # | Test | Command / Action | Pass criteria |
|---|------|------------------|---------------|
| 11.1 | No LangGraph imports | `grep -r '@langchain' src/` | Zero results. |
| 11.2 | No LangGraph deps | `grep langgraph package.json` | Zero results. |
| 11.3 | Type gate | `pnpm typecheck` | Zero errors. |
| 11.4 | Tests pass | `pnpm test` | All tests pass. |
| 11.5 | Build passes | `pnpm build` | Builds successfully. |
| 11.6 | App works | `pnpm dev` + use chat | Everything still works. |

### 🚪 Exit criteria
- Zero `@langchain` references in source or dependencies.
- All tests pass, build works, chat works.

---

## Summary

| Milestone | Human sees | Tests |
|-----------|-----------|-------|
| 0 | `pnpm dev` starts | install, typecheck, dev server, import audit |
| 1 | Adapter isolates SDK | unit tests, typecheck, import audit |
| 2 | `curl /api/threads` works | empty/populated/error curl tests |
| 3 | `curl /api/threads/[id]` works | valid/invalid ID tests, mapper tests |
| 4 | SSE streams events | curl SSE, terminal events, resume |
| 5 | Hook consumes SSE | unit tests for content, tools, errors, cleanup |
| 6 | Real chat in browser | E2E streaming, reload, persistence |
| 7 | Sidebar loads & selects | UI tests, URL sync, new-thread appearance |
| 8 | Tool calls render | mapper fixtures, manual tool tests |
| 9 | File upload works | UI, API payload, large-file, multi-file |
| 10 | Cross-client sync & polish | CLI sync, build, dark mode, branding |

