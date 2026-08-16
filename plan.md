# AI-Powered Manim Animation SaaS — Product & Architecture Plan

## Vision

An AI-powered website where users describe a math/science animation in plain English (or write/edit code directly for more control) and get back a rendered Manim video. The product is built JS/TS-first end to end — Python is confined to a single isolated, sandboxed rendering microservice, since Manim itself can only execute in Python. Everything else (frontend, backend/API, auth, billing, orchestration, AI integration, community features) is Node/TypeScript.

The core technical risk shaping most of the architecture: the AI generates arbitrary Python (Manim scene code) that then gets **executed server-side**. That's untrusted code execution and is treated as the top security priority throughout.

---
ba407ed1
## 1. High-Level Architecture

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (App Router) + React + TypeScript + Tailwind | SSR for crawlable/shareable public gallery pages; one framework for marketing + app + embeds |
| Code editor (power-user mode) | Monaco Editor (pure JS) | Syntax highlighting, diffing AI-proposed edits, the "Cursor-style" editing experience, no Python involved |
| API layer | tRPC (internal) + versioned REST/OpenAPI (public Developer API, Phase 4) | End-to-end type safety internally; a stable external contract once selling API access |
| Backend runtime | Node.js + TypeScript, Fastify | Decoupled from the frontend's deploy lifecycle as it grows |
| Database | PostgreSQL (Drizzle or Prisma) | Relational integrity matters — this is also a billing system |
| Job queue | BullMQ on Redis | Priority queues (paid tiers render faster), retries, progress events |
| Realtime progress | Server-Sent Events (Fastify → client) | Simple one-directional streaming for render progress; upgrade to WebSocket/Socket.IO only if collaborative editing is added later |
| Auth | Clerk (or Auth.js) | Clerk gives org/teams support out of the box for later classroom features |
| Billing | Stripe + a custom credits ledger table in Postgres | Stripe tracks money; render cost varies per job, so a separate credits ledger is needed |
| Object storage | Cloudflare R2 (or S3) | Zero egress fees matter a lot for a video-heavy product |
| CDN | Cloudflare | Pairs naturally with R2 |
| LLM integration | Claude via the Vercel AI SDK, behind an internal `LLMProvider` abstraction | Swappable/AB-testable models; streaming maps well to "generating code..." UX |
| Python render worker | Standalone Docker container(s): Python + Manim + ffmpeg | Invoked *only* via a queue message — never imported into the Node process |
| Sandboxing | Firecracker microVMs or gVisor-wrapped Docker; start with a managed sandbox provider (E2B or Modal) | Untrusted code execution needs real isolation, not just a container |
| Deploy | Vercel (frontend); Fly.io / Railway / AWS ECS-Fargate (Node API, BullMQ workers, Python render fleet); Upstash Redis | Fly.io is Firecracker-native, good fit for the sandboxed worker fleet |

**Hard architectural rule:** the Python worker never talks to Postgres, Stripe, or the LLM, and has no outbound network access. It only receives scene code + a job id and returns a video file. All "intelligence" (ownership, billing, prompt handling) lives in the Node layer.

```
[Next.js Frontend] --tRPC/REST, SSE--> [Fastify API]
                                          |-- Auth (Clerk)
                                          |-- Billing (Stripe) + Credits Ledger (Postgres)
                                          |-- LLM (Claude) -- code generation
                                          |-- AST safety check
                                          |-- Enqueue job --> [BullMQ / Redis]
                                                                    |
                                                                    v
                                                  [Sandboxed Render Worker Fleet]
                                                  Python + Manim + ffmpeg
                                                  no network, capped CPU/mem/time
                                                                    |
                                                                    v
                                                        [R2/S3 + CDN] --> back to client
```

---

## 2. Core User Flows

### Chat-to-video (default)
1. User describes the animation in a chat panel.
2. Backend estimates render cost against the user's credit balance *before* calling the LLM; estimated cost/time shown in the UI.
3. LLM generates Manim code, streamed via SSE — collapsed by default, expandable for the curious.
4. Static AST-based validation rejects disallowed imports/patterns before the job is ever enqueued.
5. Job enqueued to BullMQ with priority derived from plan tier.
6. Sandboxed worker renders: no network, capped CPU/memory/wall-clock, ephemeral filesystem.
7. Render progress (frame count) relayed to the client over SSE.
8. On success: video + thumbnail uploaded to storage, playable inline, downloadable, shareable. On failure: error summarized in plain language; if it's a fixable code error, one automatic "self-heal" regeneration + re-render attempt runs before surfacing failure.
9. Every successful render auto-saves to project history; the user can publish to the gallery, generate a share link, or grab an embeddable iframe snippet.

### AI-assisted code editor (power user)
1. Monaco pane (Manim source) + live preview pane + AI chat side panel.
2. Seed code from a fresh prompt or from a prior chat-mode render.
3. "Live preview" = a fast, low-res/low-fps render through the same sandbox with a shorter timeout and cheaper credit cost; "Render Final" is a separate, explicit, full-resolution action.
4. Selection-based AI edits return a diff (Monaco diff view) — never silently overwritten.
5. AI autocomplete grounded via retrieval against a curated Manim API reference, to cut down on hallucinated method names.
6. Every accepted edit or successful render creates an immutable version snapshot, enabling rollback.

---

## 3. Feature Set

**Content/creation**
- Template & scene library (Pythagorean theorem, unit circle, matrix transforms, proof scaffolds) to seed either mode.
- Reusable parameterized "components" (graph plotter, vector field, coordinate-camera moves) the LLM is steered to prefer over raw primitives — improves reliability.
- LaTeX equation input widget (KaTeX preview) feeding directly into generated `MathTex` calls.
- Voiceover/narration via TTS (ElevenLabs/Azure/Google), synced to animation beats.
- Multi-scene storyboard composition: chain independently-generated scenes into a timeline, stitched via ffmpeg concat, with per-scene regeneration.
- Export options: resolution presets (4K gated to paid tiers), mp4/webm/gif, transparent background.
- Style/theme presets (3Blue1Brown-style dark/blue, whiteboard/light, custom brand colors).

**Community/social**
- Public gallery: likes, view counts, tags/categories, search. Default visibility is **unlisted**, not public, until explicitly published.
- Remix/fork: clone another user's animation source into your own account with attribution.
- Embeddable player widget (iframe) for teachers/bloggers.

**Education/collaboration**
- Teacher/classroom accounts, shareable lesson links, pooled class credits.
- Project version history — also a lightweight collaboration safety net before real-time collab exists.
- Real-time collaborative editing (Yjs/CRDT over WebSocket) as a later phase, if demand supports the complexity.

**Platform/monetization**
- Developer API (REST, API keys), metered separately from web-app credits.
- Usage-based credit billing with pre-render cost estimation shown before commit.

---

## 4. Security & Abuse Prevention (non-negotiable)

- **Isolation**: Firecracker microVMs or managed sandboxes (E2B/Modal) for every render job; **no network egress** from inside the sandbox at all — output is written to ephemeral local disk and uploaded by the trusted orchestrator after the sandbox exits. This alone kills most exfiltration/SSRF/mining attack classes.
- **Filesystem**: ephemeral read-only base image + scratch tmpfs, destroyed per job, no shared volumes, no persistent state, no credentials inside the sandbox beyond a short-lived write-only pre-signed upload URL.
- **Resource limits**: hard CPU/memory caps and a wall-clock timeout enforced by the orchestrator, not trusted to the code itself — shorter for preview renders, longer for final renders.
- **Defense in depth**: AST-based static analysis rejecting disallowed imports (`os`, `subprocess`, `socket`, `ctypes`, `eval`/`exec`, dunder traversal) before a job is even enqueued; system prompt constrains the LLM to an approved API surface. This reduces accidental unsafe generation but is never a substitute for the sandbox.
- **Output validation**: verify rendered output is a well-formed video of expected size/duration before marking a job successful and serving it to others via the gallery.
- **Rate limiting**: Redis-backed token bucket per user/tier on LLM calls and render submissions; separate BullMQ-level concurrency caps on in-flight jobs per user; credits act as the ultimate economic backstop.
- **Content moderation**: a fast classification pass on prompts before generation; reportable/flaggable gallery content with an admin moderation queue — build the `flags`/`moderation_status` schema early even if the moderation UI ships later.

---

## 5. Scalability & Cost

- Stateless, ephemeral, pull-based render workers scaled by **queue depth**, not per-box CPU.
- BullMQ numeric priority mapped to plan tier; consider physically separate worker pools per tier at larger scale so free-tier bursts can't starve paying customers.
- Pre-render cost estimation from scene-complexity heuristics (parsed animation/mobject counts, resolution, duration, quality preset), calibrated over time against real render-duration data; reconcile estimated-vs-actual credits after each job.
- Cache renders by hashing final validated source + params — instant, zero-cost delivery for unchanged re-renders (common in editor-mode iteration).
- Lazy on-demand transcoding to non-default resolutions rather than pre-generating every rendition.
- Distinguish `infra_error` (retry with backoff, capped ~2 attempts) from `code_error` (route to LLM self-heal instead of blind retry).
- Warm sandbox pool to avoid cold-start latency dominating the "preview" iteration loop in editor mode.

---

## 6. Phased Roadmap

- **Phase 0 — Render pipeline PoC**: hardcoded Manim source → Redis queue → single sandboxed worker (E2B) → storage upload → URL back. No auth/billing/UI. Goal: prove the pipeline and collect real render-time data.
- **Phase 1 — Chat-to-video MVP**: Next.js app, Clerk auth, Stripe + credits ledger, chat UI wired to Claude, AST validation, priority queueing, SSE progress, project history. This is the sellable MVP.
- **Phase 2 — Code editor mode**: Monaco integration, fast preview render path, AI inline-edit + diff view, version history.
- **Phase 3 — Community**: public gallery, share links, embeddable widget, fork/remix, moderation queue, template library.
- **Phase 4 — Scale & platform**: Developer API + usage billing, TTS/voiceover, multi-scene storyboards, theme presets, classroom accounts, per-tier worker pools, render caching, self-heal refinement, cost/observability dashboards.

---

## Suggested First Files (once implementation starts)

- `apps/web/` — Next.js frontend (chat, editor, gallery)
- `apps/api/src/server.ts` — Fastify entry point (auth, billing, orchestration)
- `apps/api/src/queue/renderQueue.ts` — BullMQ producer + job schema (the Node↔Python contract)
- `apps/api/src/validation/astGuard.ts` — static AST safety check
- `worker/render_worker/main.py` — sandboxed Python worker (queue consumer, Manim invocation, ffmpeg, storage upload) — build and harden this first
- `packages/db/schema.ts` (Drizzle) or `schema.prisma` — users, projects, versions, renders, credits ledger, gallery items, moderation flags
- `docker-compose.yml` / `infra/` — local dev wiring for Redis, Postgres, sandboxed worker image
