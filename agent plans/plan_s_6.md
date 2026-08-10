# Plan S - Step 6: Agent Rules Consolidation & Codebase Cleanup

This document outlines **Step 6** of the S-tier roadmap. The goal is to clean up and unify the developer-agent instructions, ensure testing utilities are easily accessible, and organize the project's documentation files.

---

## 1. Agent Rules Consolidation

We need to ensure that any AI agent interacting with this codebase (whether it's Jules, an open-source model, or the agents-window itself) receives a consistent and centralized set of instructions.

*   **Review Existing Rules:** Locate all agent instruction files in the repository (e.g., `.clinerules`, `AGENTS.md`, and any other similar files).
*   **Merge and Streamline:** Consolidate these into a single, standard file (e.g., `.clinerules` or `AGENTS.md`). Ensure instructions are streamlined, removing redundancies.
*   **Accessibility:** Ensure this single file dictates strict developer-agent guidelines on Test-Driven Development (TDD), meta-testing protocols (forcing tests to fail), and permanent diagnostics logging.

## 2. Documentation of Testing Utilities

*   **Verify Access:** Ensure that the testing utilities we have built (e.g., how to run tests, how to check coverage, how to use Playwright tracing, how to read Winston logs) are clearly documented in the consolidated rules file.
*   **Agent Usability:** Ensure that these utilities are described in a way that is immediately accessible and usable to any agent operating in the codebase.

## 3. Codebase Cleanup (The Final Polish)

Once Steps 1-5 and the above consolidation are fully complete, clean up the repository root to keep the project tidy.

*   **Remove Master Plan:** Delete the `PLAN_S.md` file from the repository root, as its tasks have been fully decomposed and executed.
*   **Move Sub-Plans:** Move all remaining executed plan files (e.g., `plan_s_2.md`, `plan_s_4.md`, `plan_s_5.md`, `plan_s_6.md`) into the `agent plans/` directory. (Ensure the directory exists or create it).
*   **Final Verification:** Ensure the repo root only contains essential files (like `README.md`, `ROADMAP.md`, `package.json`, etc.) and that no legacy implementation plans are cluttering the main directory.
