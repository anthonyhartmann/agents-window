# Tech Spec: agents-window — Cline Chat UI

## 1. Overview

**Goal:** Build a web-based chat interface for Cline by forking the [LangChain Agent Chat UI](https://github.com/langchain-ai/agent-chat-ui) and rewiring its backend from LangGraph to the Cline SDK (`@cline/core`).

**Why this approach:**
- Agent Chat UI is a polished, open-source Next.js application with a modern component library (shadcn/ui), markdown rendering, tool-call display, file upload, artifacts, and thread history.
- Cline already has a robust local SDK (`@cline/sdk` v0.0.65) that supports session management, streaming events, tool execution, and persistence.
- Rather than building a UI from scratch, we adapt the frontend shell and replace only the data layer.

**Outcome:** A standalone Next.js app (`agents-window`) running on `localhost:3000` that starts Cline sessions, streams responses, displays tool calls, and persists conversation history alongside existing Cline CLI/IDE sessions.

---

## 2. System Architecture

```
Browser (localhost:3000)
  Thread List    Chat Thread     Artifact / Code
  (sidebar)      (main)          (right panel)
        |              |                |
        +--------------+----------------+
                       | SSE / HTTP
        +--------------v----------------+
        |   Next.js API Routes          |
        |   /api/chat/stream            |
        |   /api/threads                |
        |   /api/threads/[id]           |
        |          |                    |
        |   +------v----------------+   |
        |   |   Cline SDK           |   |
        |   |   start/send/subscribe|   |
        |   +------^----------------+   |
        |          |                    |
        |   sessions.db  LLM APIs  MCP  |
        |   ~/.cline/    (Anthropic,    |
        |              OpenAI, etc.)    |
        +-------------------------------+
```

### Key Design Decisions

- **Monorepo:** Single Next.js app. No separate backend server. API routes run in the same Node process as the frontend.
- **SSE Streaming:** The `/api/chat/stream` route uses Server-Sent Events to push Cline `AgentEvent`s to the browser in real time.
- **Shared Session Store:** The app uses the default Cline data directory (`~/.cline/data/`). Conversations started in the web UI are visible in the Cline CLI and VS Code extension, and vice versa.
- **LangGraph Message Compatibility:** We map Cline events to a message shape that closely mirrors LangGraph's `Message` type so the existing UI components require minimal changes.

---

## 3. Technology Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Framework | Next.js | 15.x | App Router, API Routes |
| Language | TypeScript | 5.8.x | Strict mode |
| Runtime | Node.js | 22.22.1 | Required for `@cline/sdk` |
| UI Library | React | 19.x | Server Components where possible |
| Styling | Tailwind CSS | 4.x | Already configured in agent-chat-ui |
| Components | shadcn/ui | latest | Button, Input, Switch, Tooltip, etc. |
| State (URL) | nuqs | 2.x | Query-state for threadId, sidebar open |
| Scroll | use-stick-to-bottom | 1.x | Auto-scroll chat to bottom |
| Icons | lucide-react | latest | Icon set |
| Backend SDK | `@cline/core` | 0.0.65 | Copied from global `cline` install |
| Persistence | SQLite (Cline) | — | `~/.cline/data/db/sessions.db` |

**Removed dependencies:**
- `@langchain/langgraph-sdk` and `@langchain/langgraph-sdk/react-ui`
- `langgraph-nextjs-api-passthrough`
- `@langchain/core`
- `@langchain/langgraph`

---

## 4. Data Model

### 4.1 Cline Stream Events (Server → Client)

The SSE endpoint emits newline-delimited JSON objects:

```typescript
type ClineStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; name: string; output?: unknown; error?: string; durationMs?: number }
  | { type: "reasoning_delta"; text: string }
  | { type: "usage"; inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number; totalCost?: number }
  | { type: "iteration_start"; iteration: number }
  | { type: "iteration_end"; iteration: number; hadToolCalls: boolean; toolCallCount: number }
  | { type: "done" }
  | { type: "error"; message: string }
  | { type: "status"; status: string };
```

### 4.2 Frontend Message Type

```typescript
interface UIMessage {
  id: string;
  type: "human" | "ai" | "tool";
  content: string | ContentBlock[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string; // for tool result messages
  createdAt?: string;
}

interface ToolCall {
  id: string;
  name: string;
  args: unknown;
}

interface ContentBlock {
  type: "text" | "image" | "file";
  text?: string;
  mimeType?: string;
  data?: string; // base64
  name?: string; // filename
}
```

### 4.3 Thread Type

```typescript
interface UIThread {
  thread_id: string;
  created_at: string;
  updated_at: string;
  metadata: {
    name?: string;
    status?: string;
  };
}
```


---

## 5. API Specification

### 5.1 `POST /api/chat/stream`

Starts or continues a Cline session and streams events back via SSE.

**Headers:**
```
Content-Type: application/json
Accept: text/event-stream
```

**Request Body:**
```json
{
  "threadId": "1785255661814_gtekl",
  "messages": [
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hi there!" },
    { "role": "user", "content": "Write a Python script" }
  ],
  "attachments": {
    "userImages": ["data:image/png;base64,iVBORw0KGgo..."],
    "userFiles": [{ "name": "schema.sql", "content": "CREATE TABLE..." }]
  }
}
```

**Response:** `text/event-stream`

Each line is a JSON object:
```
data: {"type":"text_delta","text":"Sure"}

data: {"type":"text_delta","text":"!"}

data: {"type":"tool_call","id":"tc_01","name":"bash","input":{"command":"mkdir scripts"}}

data: {"type":"tool_result","id":"tc_01","name":"bash","output":{"stdout":""}}

data: {"type":"done"}
```

**Error handling:** If the session fails to start, the endpoint sends an SSE `error` event and closes the stream. HTTP 500 is used only for unexpected route errors before streaming begins.

### 5.2 `GET /api/threads`

Lists recent Cline sessions.

**Response:**
```json
{
  "threads": [
    {
      "thread_id": "1785255661814_gtekl",
      "created_at": "2026-08-01T14:21:01.814Z",
      "updated_at": "2026-08-01T14:23:45.200Z",
      "metadata": { "name": "Write a Python script" }
    }
  ]
}
```

**Implementation:** Query `~/.cline/data/db/sessions.db` using the `SqliteSessionStore` class exposed by `@cline/core`.

### 5.3 `GET /api/threads/[id]`

Retrieves the full message history for a session.

**Response:**
```json
{
  "thread_id": "1785255661814_gtekl",
  "messages": [
    { "id": "msg_1", "type": "human", "content": "Write a Python script" },
    { "id": "msg_2", "type": "ai", "content": "Sure! Here's a script:", "tool_calls": [{ "id": "tc_01", "name": "editor", "args": { "file_path": "hello.py", "content": "print('hello')" } }] },
    { "id": "tc_01", "type": "tool", "content": "", "name": "editor", "tool_call_id": "tc_01" }
  ]
}
```

**Implementation:** Read `~/.cline/data/sessions/<id>/<id>.messages.json`, parse the array of Cline internal messages, and map them to `UIMessage`.


---

## 6. Frontend Specification

### 6.1 Custom Hooks

#### `useClineStream()`

Replaces `@langchain/langgraph-sdk/react`'s `useStream`.

```typescript
interface UseClineStreamReturn {
  messages: UIMessage[];
  isLoading: boolean;
  error: Error | null;
  submit: (input: { messages: Array<{ role: string; content: string }> }, options?: SubmitOptions) => void;
  stop: () => void;
  threadId: string | null;
  interrupt: unknown | undefined;
  getMessagesMetadata: (message: UIMessage) => MessageMetadata | undefined;
}

function useClineStream(): UseClineStreamReturn;
```

**Behavior:**
- On `submit`, opens a `fetch` request to `/api/chat/stream` with `Accept: text/event-stream`.
- Reads the response body as a `ReadableStream`, decoding lines as JSON.
- Appends the user's message to `messages` immediately (optimistic update).
- Creates a new AI message placeholder on the first `text_delta` or `agent_event`.
- Aggregates `text_delta` chunks into the AI message's `content`.
- On `tool_call`, appends a `ToolCalls` sub-object to the AI message (or a separate `tool` message depending on renderer needs).
- On `tool_result`, appends a `tool` message.
- On `done` or stream close, sets `isLoading = false`.
- On `error` event, sets `error` state.
- `stop()` calls `AbortController.abort()` on the active fetch.
- Persists `threadId` in URL query state via `nuqs`.

#### `useThreads()`

```typescript
interface UseThreadsReturn {
  threads: UIThread[];
  getThreads: () => Promise<UIThread[]>;
  setThreads: React.Dispatch<React.SetStateAction<UIThread[]>>;
  threadsLoading: boolean;
}
```

**Behavior:**
- Fetches `/api/threads` on mount and when a new session is created.
- Sorts by `updated_at` descending.

### 6.2 Providers

#### `ClineStreamProvider`

Replaces `StreamProvider` and `StreamSession`.

- No setup form (we don't need Deployment URL / Assistant ID / API key; Cline loads these from `~/.cline/data/settings/providers.json`).
- Wraps children with `StreamContext.Provider` value from `useClineStream()`.
- On mount, if `threadId` is present in the URL, fetches thread messages via `/api/threads/[id]` and hydrates the stream state.

#### `ThreadProvider`

Largely unchanged in structure, but `getThreads` calls `/api/threads` instead of the LangGraph client.

### 6.3 Pages & Layout

| Route | File | Description |
|-------|------|-------------|
| `/` | `src/app/page.tsx` | Main chat page. Wraps `ThreadProvider → ClineStreamProvider → ArtifactProvider → Thread`. |
| Root layout | `src/app/layout.tsx` | Fonts, themes, `NuqsAdapter`. Remove LangGraph-specific metadata if desired. |

### 6.4 Components (Minimal Changes)

| Component | Changes |
|-----------|---------|
| `Thread` (`src/components/thread/index.tsx`) | Update imports to use `useClineStreamContext`. Remove `contentBlocks` / file-upload logic if we simplify, or keep it and pass attachments to `submit`. |
| `HumanMessage` | Replace `useStreamContext` import. `submit` signature changes slightly (passes checkpoint via options). |
| `AssistantMessage` | Replace `useStreamContext` import. Types for `tool_calls` come from local types instead of LangGraph SDK. |
| `ToolCalls` / `ToolResult` | Likely no changes if we preserve the same props interface. |
| `ThreadHistory` | Calls `useThreads` (unchanged hook name, new implementation). |
| `ArtifactProvider` | Keep as-is for now; artifacts can be populated from `tool_result` events later. |

### 6.5 Global State & Side Effects

- **No global state library** (no Redux, Zustand, etc.). React Context + `nuqs` is sufficient.
- **Auto-scroll:** `use-stick-to-bottom` stays exactly as-is.
- **Theme:** `next-themes` stays exactly as-is.
- **Toasts:** `sonner` stays exactly as-is.


---

## 7. Backend Specification

### 7.1 Singleton ClineCore Instance

`src/lib/cline-client.ts`

```typescript
import { ClineCore } from "@cline/core";

let corePromise: Promise<ClineCore> | null = null;

export async function getClineCore(): Promise<ClineCore> {
  if (!corePromise) {
    corePromise = ClineCore.create({ clientName: "agents-window" });
  }
  return corePromise;
}
```

- `ClineCore.create()` initializes the runtime host (local mode), discovers config from `~/.cline/`, and connects to the hub on port 25463 if already running.
- The singleton ensures we don't spawn multiple runtimes.

### 7.2 SSE Route Handler

`src/app/api/chat/stream/route.ts`

```typescript
export async function POST(req: NextRequest) {
  const { threadId, messages, attachments } = await req.json();
  const core = await getClineCore();
  const runtimeHost = (core as any).host; // or use public API if available

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ClineStreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      const listener = (event: CoreSessionEvent) => {
        // Map CoreSessionEvent → ClineStreamEvent
        // ...
      };

      const unsubscribe = runtimeHost.subscribe(listener);

      try {
        if (!threadId) {
          const result = await core.start({
            config: {
              providerId: "cline-pass",
              modelId: "deepseek/deepseek-v4-pro",
              workspaceRoot: "/Users/anthonyhartmann/.cline/data/workspaces/chat",
              enableTools: true,
            },
            prompt: messages[messages.length - 1].content,
            attachments,
          });
          send({ type: "status", status: "started", sessionId: result.sessionId });
        } else {
          await core.send(threadId, {
            prompt: messages[messages.length - 1].content,
            ...attachments,
          });
        }
      } catch (err) {
        send({ type: "error", message: String(err) });
        controller.close();
      }

      // Keep stream open until session ends or client disconnects
      // ...
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

**Open questions to resolve during implementation:**
- The exact public API for accessing `runtimeHost` from `ClineCore` (may require reading SDK source or using type casts).
- How to detect session end reliably to close the SSE stream.

### 7.3 Threads API

`src/app/api/threads/route.ts`

```typescript
import { SqliteSessionStore } from "@cline/core";

const store = new SqliteSessionStore({ dbPath: "/Users/anthonyhartmann/.cline/data/db/sessions.db" });

export async function GET() {
  const records = await store.list(); // exact method TBD from SDK source
  const threads = records.map((r) => ({
    thread_id: r.sessionId,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
    metadata: { name: r.prompt?.slice(0, 50) || "Untitled" },
  }));
  return Response.json({ threads });
}
```

**Note:** If `SqliteSessionStore` API is not stable, we can fall back to raw SQLite queries on the known schema.

### 7.4 Thread Messages API

`src/app/api/threads/[id]/route.ts`

```typescript
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const messagesPath = `/Users/anthonyhartmann/.cline/data/sessions/${id}/${id}.messages.json`;
  const raw = await fs.readFile(messagesPath, "utf-8");
  const messages = JSON.parse(raw);
  const uiMessages = messages.map(mapClineMessageToUIMessage);
  return Response.json({ thread_id: id, messages: uiMessages });
}
```


---

## 8. Event Mapping Reference

| Cline `CoreSessionEvent` | Our SSE Event | UI Action |
|--------------------------|---------------|-----------|
| `type: "chunk", stream: "agent"` | `text_delta` | Append to AI message text |
| `type: "agent_event", event.type: "content_start", contentType: "text"` | `text_delta` | Start new AI message, append text |
| `type: "agent_event", event.type: "content_start", contentType: "tool"` | `tool_call` | Show tool call bubble |
| `type: "agent_event", event.type: "content_update", contentType: "tool"` | — (optional) | Update tool call progress |
| `type: "agent_event", event.type: "content_end", contentType: "tool"` | `tool_result` | Show tool result |
| `type: "agent_event", event.type: "iteration_start"` | `iteration_start` | (Optional) show iteration counter |
| `type: "agent_event", event.type: "usage"` | `usage` | Update token/cost display |
| `type: "agent_event", event.type: "done"` | `done` | Finalize message, stop loading |
| `type: "ended"` | `done` | Finalize message, stop loading |
| `type: "error"` | `error` | Show toast, stop loading |
| `type: "status"` | `status` | (Optional) show status pill |

---

## 9. File Inventory

### 9.1 New Files

| Path | Purpose |
|------|---------|
| `src/lib/cline-client.ts` | Singleton `ClineCore` initializer |
| `src/lib/cline-types.ts` | Shared TypeScript types (events, messages, threads) |
| `src/lib/map-events.ts` | `CoreSessionEvent` → `ClineStreamEvent` mapper |
| `src/lib/map-messages.ts` | Cline session file → `UIMessage` mapper |
| `src/hooks/use-cline-stream.ts` | Custom hook replacing `useStream` |
| `src/providers/ClineStream.tsx` | React Context provider for stream state |
| `src/app/api/chat/stream/route.ts` | SSE streaming endpoint |
| `src/app/api/threads/route.ts` | List threads |
| `src/app/api/threads/[id]/route.ts` | Get thread messages |

### 9.2 Modified Files

| Path | Change |
|------|--------|
| `package.json` | Remove LangGraph deps; add `@cline/sdk` (local file path) |
| `src/app/page.tsx` | Replace `StreamProvider` with `ClineStreamProvider` |
| `src/app/layout.tsx` | Update metadata title/description |
| `src/providers/Thread.tsx` | Replace LangGraph client with fetch to `/api/threads` |
| `src/components/thread/index.tsx` | Import from new stream provider |
| `src/components/thread/messages/ai.tsx` | Update type imports |
| `src/components/thread/messages/human.tsx` | Update type imports |
| `src/components/thread/history.tsx` | Update type imports |

### 9.3 Deleted Files

| Path | Reason |
|------|--------|
| `src/app/api/[..._path]/route.ts` | LangGraph proxy no longer needed |
| `src/providers/Stream.tsx` | Replaced by `ClineStreamProvider` |
| `src/providers/client.ts` | LangGraph client factory no longer needed |
| `src/lib/api-key.ts` | API key is handled by Cline settings |

---

## 10. Configuration & Environment

No `.env` variables are required for basic operation because Cline discovers its own settings from `~/.cline/data/settings/`.

Optional environment variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `CLINE_DATA_DIR` | `~/.cline/data` | Override Cline data directory |
| `CLINE_DEFAULT_PROVIDER` | read from `providers.json` | Override which provider to use for new sessions |
| `CLINE_DEFAULT_MODEL` | read from `providers.json` | Override which model to use |
| `NEXT_PUBLIC_APP_NAME` | `agents-window` | Browser tab title |


---

## 11. Risks, Assumptions & Mitigations

| # | Risk / Assumption | Mitigation |
|---|-------------------|------------|
| 1 | `@cline/sdk` is not published to npm; we must reference the bundled copy inside the global `cline` package. | Use `file:` dependency in `package.json` pointing to `~/.asdf/installs/nodejs/22.22.1/lib/node_modules/cline/node_modules/@cline/sdk`. If that breaks, copy the scoped packages into the project's `node_modules` manually. |
| 2 | `ClineCore` internal APIs (`host`, `subscribe`) may not be fully public / stable. | Wrap in an adapter module. If the API changes, only the adapter needs updating. |
| 3 | SSE stream lifecycle (when to close) is ambiguous because Cline sessions can run arbitrary tool commands. | Close the SSE on `ended` or `done` event. If the session continues background work, the user can refresh or we can implement polling later. |
| 4 | Existing Cline sessions (e.g., file-editing tasks from VS Code) may look strange in a chat UI. | Acceptable for Phase 1. Future improvement: filter sessions by `source` metadata or add a "chat-only" toggle. |
| 5 | Tool call rendering assumes LangGraph-style `tool_calls` arrays. | Our mapper produces the same shape so existing components work. |
| 6 | File upload size limits in Next.js API routes. | Default body size limit is ~1MB. If users upload large images, increase `bodyParser` limit in the route config. |

---

## 12. Implementation Order

1. **Bootstrap** — Clone agent-chat-ui, install deps, link `@cline/sdk`, verify `pnpm dev` runs.
2. **Types & Adapter** — Write `cline-types.ts`, `map-events.ts`, `map-messages.ts`.
3. **Backend API** — Implement `/api/threads` and `/api/threads/[id]` first (easiest to test with `curl`).
4. **SSE Stream** — Implement `/api/chat/stream` using a minimal test script that calls `ClineCore.start()`.
5. **Frontend Hook** — Write `useClineStream` with a mock SSE response. Verify message accumulation.
6. **Integration** — Wire hook to real API route. Test end-to-end with a simple prompt.
7. **UI Polish** — Update Thread provider, remove setup form, add Cline branding, verify tool call rendering.
8. **History & Persistence** — Ensure thread list updates after new messages, verify session files are written.

---

## 13. Open Questions

1. Does `ClineCore` expose a public getter for the `RuntimeHost`, or do we need to cast `private host`?
2. What is the exact schema of `sessions.db` (table names, columns)? Should we use `SqliteSessionStore` or raw SQL?
3. Can `ClineCore.start()` accept `attachments` (images/files) in the current SDK version, or do we need to encode them into the prompt?
4. Should we support branching / checkpoints in the UI? Cline SDK has checkpoint support; Agent Chat UI has branch switchers. Phase 1 can disable branching.
5. Do we need to handle the Cline hub daemon lifecycle (start/stop on port 25463), or assume it's always running because the user uses Cline CLI/IDE regularly?

---

## 14. Success Criteria

- [ ] `pnpm dev` starts without errors.
- [ ] User can type a message and see a streaming response from Cline.
- [ ] Tool calls (e.g., `bash`, `editor`) appear inline in the chat.
- [ ] Thread history sidebar lists past sessions.
- [ ] Clicking a past session loads its messages.
- [ ] New web sessions are visible in `~/.cline/data/sessions/` and readable by the Cline CLI.
- [ ] File upload works for images (passed as `userImages` to Cline).
- [ ] Dark mode and scroll-to-bottom behavior work.
