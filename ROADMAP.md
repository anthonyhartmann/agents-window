# Agent Chat UI (agents-window) — Master Development Roadmap

This document outlines a concrete, actionable roadmap for the `agents-window` repository, tailored for **cheap/free AI model development** and **efficient agentic workflows**.

The goal of this roadmap is to establish a fast, reliable, and low-cost development environment first, and then incrementally introduce features that make cheap models perform like expensive ones (e.g., through context compacting, planner-worker delegation, and robust error/debugging loops).

---

## Roadmap Overview & Prioritization

```
  [S] Blazing Fast Dev Loop  --->  [A] Provider Abstraction & Model Selection
           |                                         |
           v                                         v
  [B] Reliability & Dual-Wield  --->  [C] Productionizing & Cost Management
           |
           v
  [D] Moonshot (Cloud Sandbox)
```

---

## [S] Immediate Needs: Better Testing & Agentic Debugging Loop

When using cheap or free models, agents are prone to hallucinating React errors or failing to comprehend network failures. The priority is to build a development loop where the agent **always knows exactly what is going wrong**.

### 1. Unified Client-Side Debug Interceptor & Error Boundary
* **Problem:** The agent cannot see client-side React rendering crashes or inspect browser console logs.
* **Solution:** Create an automated diagnostic state dump that the agent can read from disk whenever a frontend error occurs.
* **Action Plan:**
  1. **React Error Boundary:** Implement a custom global Error Boundary in `src/providers/ErrorBoundary.tsx` wrapping the Next.js app layout.
  2. **Automated Error Dumping:** When a rendering crash or unhandled runtime rejection occurs, serialize the stack trace, component tree trace, and active state (current route, active `threadId`, and standard query states) to a local JSON file in the project root: `.agents-window-debug.json`.
  3. **Console Logging Pipe:** Intercept `console.error` and `console.warn` calls in development. Append the last 20 warning/error logs to `.agents-window-debug.json`.
  4. **Agent Guidance:** Add a rule in `.clinerules` instructing the agent to always read `.agents-window-debug.json` first if a frontend check fails or a browser interaction test fails.

### 2. Network Traffic Inspector & Logging Middleware
* **Problem:** Agents often struggle with SSE streaming drops, bad API payload shapes, or 500/404 failures on endpoints like `/api/chat/stream`.
* **Solution:** A clean dev-only middleware or client utility to log network traffic details.
* **Action Plan:**
  1. Intercept `fetch` calls inside `src/hooks/useClineStream.ts` and log detailed HTTP request/response payloads to `/api/debug/network` in development.
  2. The `/api/debug/network` route will write the details directly to `.agents-window-network.json`.
  3. Include headers, response status codes, payload sizes, and connection durations, enabling the agent to diagnose silent backend failures.

### 3. Stabilizing the Sandbox & Chrome Browser Crashes
* **Problem:** Placing Cline in a sandbox causes browser instances (like Puppeteer/Playwright used by the agent) to crash due to permission/resource constraints.
* **Solution:** Optimize Puppeteer/Playwright configurations within the workspace.
* **Action Plan:**
  1. Update Puppeteer/Playwright launch options inside the agent's browser tools to include strict sandbox bypass flags:
     ```javascript
     const args = [
       '--no-sandbox',
       '--disable-setuid-sandbox',
       '--disable-dev-shm-usage',
       '--disable-gpu',
       '--no-first-run'
     ];
     ```
  2. Document standard Docker/Sandbox memory requirements (ensuring at least 2GB of shared memory `/dev/shm` is allocated if running in a container).

---

## [A] Soon: Provider Abstraction & Model Quality

Currently, the application relies heavily on `@cline/sdk`. To unlock cheaper models and more reliable connections, we must decouple the core UI from Cline and make direct provider integration simple.

```
       +--------------------------------------------+
       |             UI (StreamProvider)            |
       +--------------------------------------------+
                             |
                             v
       +--------------------------------------------+
       |               AgentAdapter                 |
       +--------------------------------------------+
             |               |                |
             v               v                v
      +------------+  +------------+  +---------------+
      | ClineCore  |  | Direct LLM |  |  LangGraph    |
      |  Adapter   |  |   Adapter  |  |  Passthrough  |
      +------------+  +------------+  +---------------+
```

### 1. Abstracting the Adapter Concept (`AgentAdapter`)
* **Problem:** Everything is hardcoded to Cline SDK's internal loop. We cannot easily chat with ChatGPT, Claude, or DeepSeek directly without spinning up the heavy Cline runtime.
* **Solution:** Define a unified, backend-agnostic adapter interface.
* **Action Plan:**
  1. Define `src/lib/agent/adapter-interface.ts`:
     ```typescript
     export interface AgentAdapter {
       startSession(input: StartSessionInput): Promise<{ sessionId: string }>;
       sendPrompt(input: SendPromptInput): Promise<void>;
       readMessages(sessionId: string): Promise<UIMessage[]>;
       listHistory(): Promise<ThreadSummary[]>;
       subscribe(listener: (event: StreamEvent) => void, sessionId?: string): () => void;
       deleteSession(sessionId: string): Promise<boolean>;
     }
     ```
  2. Re-implement `src/lib/cline/adapter.ts` as `ClineAdapter implements AgentAdapter`.
  3. Create a lightweight `DirectLLMAdapter implements AgentAdapter` using the Vercel AI SDK or direct provider REST endpoints (OpenAI, Anthropic, DeepSeek). This lets the user swap backends instantly in the UI.

### 2. High-Quality Model Selector UI
* **Problem:** Cheap models (like GPT-4o-mini or DeepSeek V3) perform well for simple tasks but struggle with complex ones. Users need a visual way to swap models per-session.
* **Solution:** Create a robust, visual model selector with presets.
* **Action Plan:**
  1. Design a UI component `src/components/thread/ModelSelector.tsx` in the header.
  2. Categorize models into logical tiers:
     - **Cheap/Fast:** `gpt-4o-mini`, `claude-3-5-haiku`, `deepseek-v3`
     - **Reasoning/Smart:** `o3-mini`, `deepseek-r1`, `claude-3-5-sonnet`
  3. Allow saving API keys securely on the client-side (`localStorage`) so that direct LLM connections work without complex backend configurations.

---

## [B] Nice-to-Have: General Reliability & Developer QoL

These features are aimed at maximizing development efficiency, enabling local workspace editing, and minimizing context window bloat.

### 1. Connection Reliability & Dual-Wielding (TUI + Window)
* **Problem:** If the web UI crashes or disconnects, active agent processes are lost. Alternatively, running Cline CLI/VS Code and the Web UI simultaneously can lead to lockups.
* **Solution:** Robust session resumption and sync.
* **Action Plan:**
  1. **Resubscribe Capability:** Modify `POST /api/chat/stream` to allow "attaching" to an ongoing execution. If a session is active, subscribe to events without restarting the run.
  2. **Active Polling/Sync:** Regularly poll `~/.cline/data/` for modifications. If a CLI action updates `messages.json`, broadcast the update to the UI via Server-Sent Events to keep TUI and Web UI perfectly synchronized.

### 2. Skill & MCP Editing Interface
* **Problem:** Custom agent behaviors and MCP tools require editing raw configuration files on disk.
* **Solution:** Create an interactive local Skill Manager in the web UI.
* **Action Plan:**
  1. Add a `/settings/skills` route and settings pane.
  2. Read and display files inside `.cline/skills/` or `.cline/data/settings/mcp_settings.json` using a lightweight web editor (such as a Monaco-based or basic text editor component).
  3. Allow saving edits, reloading MCP servers, and testing individual tool schemas directly from the browser UI.

### 3. Context Compacting for Cheap Models
* **Problem:** Cheap models have small context windows or become exponentially slower/more expensive as conversation history grows.
* **Solution:** Smart, automated conversation compression.
* **Action Plan:**
  1. **Automated Summary Blocks:** When a thread exceeds 30 messages or 15,000 tokens, trigger an automated background LLM call (using a cheap model like `gpt-4o-mini`) to summarize the first 20 messages.
  2. **History Truncation:** Replace those 20 messages on disk with a single system message: `[System Note: Below is a compressed summary of prior history: ... ]`.
  3. **Token Counter UI:** Add a tiny visual context bar showing estimated current token usage and a button to "Compress Conversation History" manually.

### 4. Sliding Scale for Reasoning Effort
* **Problem:** Models like `o3-mini` or DeepSeek R1 charge heavily for high reasoning tokens.
* **Solution:** A simple visual reasoning slider.
* **Action Plan:**
  1. In the header or next to the text input, add a toggle/slider for **Reasoning Depth** (Low, Medium, High).
  2. Map these settings directly to model parameters (e.g., `reasoning_effort` for OpenAI o1/o3-mini, or max token limits for R1 thinking blocks).

### 5. Thread Management (Archive, Delete, Search)
* **Problem:** Left sidebar can get cluttered with old development conversations.
* **Solution:** Proper database/filesystem synchronization.
* **Action Plan:**
  1. Expose `deleteSession` from `src/lib/cline/adapter.ts` onto a button in `src/components/thread/history/index.tsx`.
  2. Implement an "Archive" state in session metadata. Filter the active thread list to hide archived threads, and add an "Archived Threads" view.
  3. Implement local filtering (text search on titles) to quickly jump to past sessions.

---

## [C] Productionizing & Cost Control

Once the application is robust for local usage, these improvements focus on making the app ready for deployment and keeping cloud hosting/usage costs to a absolute minimum.

### 1. Removing Deprecated LangGraph Code
* **Problem:** Unused LangChain packages bloat bundle sizes and build times.
* **Solution:** Run a complete cleanup.
* **Action Plan (aligned with Milestone 11):**
  - Delete `src/lib/ensure-tool-responses.ts`
  - Delete `src/lib/agent-inbox-interrupt.ts`
  - Delete `src/lib/multimodal-utils.ts`
  - Delete `src/components/icons/langgraph.tsx`
  - Clean up `@langchain/core`, `@langchain/langgraph`, and `langgraph-nextjs-api-passthrough` from `package.json`.

### 2. Planner-Worker Orchestration (High-Leverage Cost Saving)
* **Problem:** Using expensive models (like Claude 3.5 Sonnet) for whole-agent runs costs a fortune. Using cheap models for planning results in poor code architecture.
* **Solution:** Orchestrate sessions with a "Dual-Model" split.
* **Action Plan:**
  1. **Phase 1: Planning Phase.** When the user sends a complex request, route it to an expensive, high-intelligence model to generate a structured `plan.md` artifact.
  2. **Phase 2: Execution Phase.** Hand off the `plan.md` to a cheap, fast worker model (e.g., `gpt-4o-mini`, `deepseek-v3`) that executes the individual file writes and shell commands step-by-step.
  3. This pattern delivers 90% of the quality of an expensive model at 10% of the cost.

### 3. Graceful UI Error States
* **Problem:** LLM rate limits or connection drops look like infinite loading states in the current UI.
* **Solution:** Rich-card error components with action triggers.
* **Action Plan:**
  1. Create a `src/components/thread/messages/ErrorMessage.tsx` component.
  2. When an API call fails, render an inline card in the message stream explaining the error (e.g., "Rate Limit Exceeded", "Invalid API Key").
  3. Add clear action buttons: **"Retry with GPT-4o-mini"**, **"Edit API Key"**, **"Resume with alternative provider"**.

### 4. Zero-Cost Cloud Deployment
* **Problem:** Next.js serverless functions on platforms like Vercel have strict 10s-60s timeouts, which will abort long-running agent threads.
* **Solution:** Dockerized, self-hosted, or free-tier edge deployments.
* **Action Plan:**
  1. Create a lightweight Dockerfile. Allow running the entire app locally or on a personal VPS (like Oracle Cloud Free Tier or a $4/month Hetzner instance) with zero timeouts.
  2. Support deployment on **Coolify** or **Render** with persistent volumes to preserve `~/.cline/data/` history.

---

## [D] Moonshot: Remote Cloud Sandbox Mode

* **Concept:** Run the entire agent and development loop inside an ephemeral cloud container, completely isolating your local laptop from risk and avoiding any browser dependencies or local CPU overhead.
* **Architecture:**
  ```
  Web UI ---> Server-Sent Events ---> Remote Next.js Server
                                              |
                                              v
                                   Docker Daemon API (Fly.io/Hetzner)
                                              |
                                              v
                                  [ Ephemeral Agent Container ]
                                     - Cloned Git Workspace
                                     - Isolated Chrome Browser
                                     - MCP Servers
  ```
* **Implementation Steps:**
  1. In the settings page, support entering a remote **Docker Host URL** or cloud API key.
  2. Spin up an ephemeral Node container preloaded with the `@cline/sdk` runtime and target git repository.
  3. Proxy files and browser windows back to the Next.js client UI via WebSockets or streaming endpoints.
