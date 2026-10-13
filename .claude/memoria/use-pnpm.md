---
name: use-pnpm
description: User wants pnpm (never npm/yarn) for any package management in their projects
metadata:
  node_type: memory
  type: feedback
  originSessionId: 6c18efc9-f428-40f3-bc41-2a129be93682
  modified: 2026-10-08T02:56:45.456Z
---

Always use pnpm when a package manager is needed; never npm or yarn.

**Why:** Explicit user preference stated 2026-10-07.

**How to apply:** On this machine the global `pnpm` shim was broken (points to a missing pnpm.exe under AppData\Local\pnpm\global\v11); `corepack pnpm` worked (v10.33). Try `pnpm` first, fall back to `corepack pnpm`.
