# From single-scene editor to a Higgsfield-style math video studio

This is the current state: one Manim scene per project, hand-written or AI-edited as a single
diff, rendered as one clip. The ask is to get to: **prompt in → full narrated YouTube video out**,
with multi-clip stitching, voiceover, and a timeline editor to touch it up afterward — the
Higgsfield/Pika-style workflow, but for math/educational animation instead of generic video.

This doc lays out the architecture change, the data model, the new services, and a phased path to
get there. It also answers the LangGraph question directly: **yes, use it, but only for the front
half of the pipeline** — see [Where LangGraph actually helps](#where-langgraph-actually-helps).

---

## 1. The pipeline, end to end

```
prompt ("explain the chain rule with an example")
   │
   ▼
┌─────────────────┐   structured LLM call → JSON storyboard:
│  1. PLAN SCENES  │   [{ narration, visual_intent, est_duration_s }, …]
└─────────────────┘   ← human-in-the-loop checkpoint: user edits/reorders/approves
   │
   ▼  (fan out, one branch per scene)
┌─────────────────┐   LLM writes Manim code for this scene from its
│ 2. GENERATE CODE │   narration + visual_intent (reuses today's AST guard)
└─────────────────┘
   │
   ▼
┌─────────────────┐   AST validate → render on the worker fleet (today's
│ 3. RENDER SCENE  │   /render, but fanned out across many scenes/projects)
└─────────────────┘   ← retry loop: validation/render failure feeds error back to step 2
   │
   ▼
┌─────────────────┐   TTS on the scene's narration text; get back audio +
│ 4. VOICEOVER     │   duration (+ word timestamps for captions)
└─────────────────┘
   │
   ▼
┌─────────────────┐   pad/trim the rendered clip to the voiceover's real
│ 5. SYNC DURATION │   duration (see §4 — this is the fiddly part)
└─────────────────┘
   │
   ▼  (join, after all scenes reach this point)
┌─────────────────┐   ffmpeg concat + crossfades + captions + background
│ 6. STITCH        │   music (ducked under VO) + intro/outro card
└─────────────────┘
   │
   ▼
   final.mp4  ──────────────────────────► timeline editor (§5) for manual touch-up,
                                            with "regenerate this clip" hooking back
                                            into steps 2–5 for a single scene only
```

Everything left of "STITCH" already exists in miniature: `editScene.ts` is step 2's prompt
pattern, `astGuard.ts` is step 3's gate, `renderer.py` is step 3's execution. The new work is
mostly **plumbing a single-scene pipeline into a many-scene one**, plus voiceover and stitching,
which don't exist at all yet.

---

## 2. Data model changes

Today: `Project` → one `currentVersion` → one `Render`. That collapses to a single clip. The new
shape needs a project to *contain* an ordered list of scenes, each with its own version/render
history (so "regenerate scene 4" doesn't touch scenes 1–3):

```prisma
model VideoProject {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  userId      String   @db.ObjectId
  title       String
  prompt      String                     // the original "explain the chain rule…" input
  status      JobStatus @default(DRAFT)  // DRAFT | PLANNING | GENERATING | STITCHING | DONE | FAILED
  finalVideoUrl String?
  createdAt   DateTime @default(now())
}

model Scene {
  id             String   @id @default(auto()) @map("_id") @db.ObjectId
  videoProjectId String   @db.ObjectId
  order          Int                       // position in the timeline
  narration      String                    // the VO script for this scene
  visualIntent   String                    // what the LLM was told to draw
  code           String                    // current Manim source (same as today's Version.code)
  sceneClassName String
  targetDurationS Float?                   // estimated from narration before render
  status         RenderStatus @default(QUEUED)  // reuse existing enum
  clipUrl        String?                   // rendered+duration-synced mp4 for this scene
  errorMessage   String?
}

model Voiceover {
  id         String   @id @default(auto()) @map("_id") @db.ObjectId
  sceneId    String   @db.ObjectId @unique
  provider   String                        // "elevenlabs" | "openai" | …
  voiceId    String
  audioUrl   String
  durationMs Int
  wordTimestamps Json?                     // for caption burn-in
}
```

`Project`/`Version`/`Render` don't need to disappear — a `VideoProject` is a container that owns
many single-scene `Project`s under the hood (or you inline the fields; either works). Keep
`CreditTransaction` as-is but add reasons for `PLAN`, `VOICEOVER`, and price a `VideoProject`
generation as the sum of its scenes up front, so you can show the user a cost estimate before
committing — a 20-scene video is a $2–5 pipeline run, not a $0.02 preview render, and that needs
to be visible before they hit "Generate."

---

## 3. Where LangGraph actually helps

You already have a job-queue system (BullMQ + Redis) doing exactly what it should for
**distributed, fan-out, retryable work**: render jobs, one per scene, processed by a worker pool.
Don't replace that — LangGraph is not a job queue and would fight BullMQ if you tried to make it
own scene rendering across worker processes.

Where LangGraph earns its keep is the **front half**: prompt → storyboard → per-scene code, which
is agentic, stateful, and has a validate-and-retry loop that's genuinely annoying to hand-roll
correctly (you'd end up rebuilding LangGraph's checkpointing badly). Concretely:

- **Structured planning as a typed node.** `generateObject` (Vercel AI SDK, already a dependency)
  with a Zod schema for the storyboard is the "PLAN SCENES" node. LangGraph gives you a place to
  put this in a graph with everything downstream, instead of a one-off function call.
- **A real retry loop with bounded attempts.** Step 2→3 (codegen → AST validate → render →
  on-failure, feed the error back into codegen) is a loop with state (attempt count, last error).
  That's exactly LangGraph's conditional-edge model — `shouldRetry(state) → "regenerate" | "done"
  | "give_up"` — instead of a hand-rolled `for` loop with no persistence if the process restarts
  mid-job.
- **Human-in-the-loop for free.** LangGraph's `interrupt()` maps directly onto "show the user the
  storyboard and let them edit/reorder/approve before burning render credits" — the same
  accept/reject UX the AI-edit diff panel already trained your users on (see the polished
  `Editor.tsx` — extend that pattern to a storyboard review screen). The graph literally pauses
  and resumes from checkpointed state, which means a user can walk away mid-review and come back.
- **Checkpointed, resumable runs.** If the process crashes after scene 6 of 12 have been planned
  and coded, you don't want to regenerate 1–6. LangGraph's checkpointer (Redis- or Postgres-backed
  — you already run Redis) persists state per step, so a `VideoProject` generation is naturally
  resumable, which a hand-rolled async function chain is not without a lot of your own bookkeeping.

**Where it hands off to what you already have:** once a scene's code is validated, the LangGraph
node's job is just to *enqueue* the existing `renderQueue.add(...)` call and `await` the result
(BullMQ has `job.waitUntilFinished(queueEvents)` for exactly this). Same for voiceover — a node
calls the TTS provider and returns. LangGraph orchestrates *what happens and in what order and
with what retries*; BullMQ/the worker fleet still does the actual heavy lifting. Stitching (step 6)
doesn't belong in the graph at all — it's a single deterministic ffmpeg job once every scene's
`clipUrl` and `Voiceover` exist, so it's just another BullMQ job type (`stitchQueue`), not a graph
node.

Sketch (TypeScript, `@langchain/langgraph`):

```ts
const StoryboardState = Annotation.Root({
  prompt: Annotation<string>(),
  scenes: Annotation<SceneDraft[]>(),
  currentSceneIndex: Annotation<number>(),
  attempt: Annotation<number>(),
  lastError: Annotation<string | null>(),
});

const graph = new StateGraph(StoryboardState)
  .addNode("planScenes", planScenesNode)          // generateObject w/ Zod schema
  .addNode("reviewPlan", reviewPlanNode)           // interrupt() — waits on user approval
  .addNode("generateSceneCode", generateSceneCodeNode)
  .addNode("validateAndRender", validateAndRenderNode) // enqueues BullMQ job, awaits it
  .addEdge(START, "planScenes")
  .addEdge("planScenes", "reviewPlan")
  .addEdge("reviewPlan", "generateSceneCode")
  .addEdge("generateSceneCode", "validateAndRender")
  .addConditionalEdges("validateAndRender", (s) =>
    s.lastError && s.attempt < 3 ? "generateSceneCode" :
    s.currentSceneIndex < s.scenes.length - 1 ? "generateSceneCode" : END
  )
  .compile({ checkpointer: redisCheckpointer });
```

If this feels like more machinery than the team wants to own, the honest fallback is: BullMQ
**flows** (parent-child jobs, which BullMQ already supports) can express the fan-out/retry
structure too, just with less first-class support for the plan-review interrupt and no
LLM-conversation-shaped state. Given the codebase already leans on the Vercel AI SDK for
streaming and structured generation, LangGraph is the smaller net-new concept to introduce, not a
bigger one — but it's genuinely optional if the retry/interrupt logic is written by hand instead.

---

## 4. The hard part nobody mentions: duration matching

Manim doesn't know how long a voiceover will be until the voiceover exists, but the animation's
pacing (`self.wait()` calls, animation `run_time`s) has to roughly match the narration or the
video feels wrong — either the visual finishes and sits idle, or the narration is still going
after the visual's done.

Three approaches, in order of how much they're worth building:

1. **Estimate first, true up after.** Before codegen, estimate narration duration from word count
   (~150 wpm reading speed) and pass a `target_duration_s` into the codegen prompt so the LLM
   paces `self.wait()`s accordingly. This gets you close but never exact, because TTS speech rate
   varies.
2. **Pad after the fact (do this one).** Once the real TTS audio duration is known, compare it to
   the rendered clip's duration. If narration is longer, hold the last frame (`ffmpeg -vf
   tpad=stop_mode=clone:stop_duration=N`) or loop a subtle idle animation. If narration is shorter,
   either trim trailing `wait()` time and re-render (cheap, since it's just a code tweak) or just
   let the visual finish early and hold on the final frame in silence — don't rush the animation to
   fit, it reads as jarring speed-up.
3. **Full resync via retiming** (skip this): stretching rendered video to match audio duration via
   speed-ramping. Motion easing breaks under retiming and it looks obviously wrong for anything
   with physics/motion — not worth building.

Ship (1)+(2). It's a solved problem in video editing (hold-frame padding) and doesn't need new
research, just an ffmpeg step between "render" and "stitch."

---

## 5. New services

- **Storyboard planner** — LLM structured-output call (`generateObject` + Zod). Takes the prompt,
  returns `{ title, scenes: [{ narration, visual_intent, est_duration_s }] }`.
- **Scene codegen (generate-from-scratch variant)** — same shape as `editScene.ts`'s
  `streamSceneEdit`, but the "current code" is empty and the prompt is built from
  `narration` + `visual_intent` + `target_duration_s` instead of an edit instruction. Same AST
  guard, same validate-before-render gate.
- **TTS provider abstraction** — a thin interface (`synthesize(text, voiceId) → { audioUrl,
  durationMs, wordTimestamps? }`) so you can start with one provider (ElevenLabs or OpenAI TTS —
  both give timestamped output, which you want for captions) without locking in early. This lives
  in the API alongside `llm/provider.ts`, mirroring how the LLM provider is already abstracted.
- **Stitcher** — a new worker endpoint/queue (`stitchQueue` → worker `/stitch`), input: ordered
  list of `{ clipUrl, audioUrl }` + optional music track, output: final mp4. Uses ffmpeg concat
  demuxer for clips, `xfade`/`acrossfade` for transitions, `amix`/sidechain compression to duck
  background music under narration, and optionally burns in captions from word timestamps
  (`ass`/`srt` filter) or muxes them as a soft-sub track.
- **Timeline editor UI** — new route, `/editor/[projectId]/timeline`. A multi-track view: a video
  clip row (drag to reorder, trim in/out handles), a narration audio row, an optional music row.
  Each clip has a "Regenerate" action that re-enters the graph at `generateSceneCode` for just that
  scene index — this is the concrete payoff of having used LangGraph for that part: "redo scene 4"
  is `graph.invoke(state, { configurable: { thread_id }, updates: { currentSceneIndex: 4 } })`
  against the *same checkpointed run*, not a bespoke one-off code path.

---

## 6. Infra changes this forces

- **Object storage.** `OUTPUT_DIR`/local disk (`worker/app/renderer.py`'s `/tmp/renders`) works for
  one container serving one clip at a time. A 20-scene video rendered across a scaled-out worker
  fleet needs shared storage — S3/R2/GCS — so any worker can render any scene and the stitcher can
  pull all of them regardless of which container produced which clip.
- **Worker fleet, not one container.** `docker-compose.yml`'s `render-worker` is capped at `cpus:
  1.0` / `mem_limit: 1g` and runs as a single replica — fine for one scene at a time, not for
  fanning out 10–20 scenes concurrently per video (see the earlier debugging in this repo where
  even 2 concurrent renders on that single container caused timing issues). This needs to become a
  horizontally-scaled pool behind the same `/render` and `/validate` contract, with BullMQ
  concurrency tuned to actual replica CPU count, not left at a value that assumes one shared core.
- **Sandbox the codegen loop for real.** `renderer.py`'s own docstring already flags this: today's
  isolation (non-root container user, subprocess timeout) is "baseline hygiene, not a security
  boundary," explicitly scoped to trusted hardcoded scenes. A many-scenes-per-video product means
  *far more* AI-generated code hitting the execution boundary, automatically, per user prompt —
  the Phase 1 sandboxing called out there (Firecracker/E2B/gVisor, no network egress) stops being
  optional before this ships broadly.
- **Cost visibility.** Show an estimated credit cost from the storyboard *before* generation starts
  (scene count × per-scene render+VO+LLM cost), since a full video is a multi-dollar job, not a
  cent-scale preview.

---

## 7. Phased path

1. **Storyboard planner + review UI.** Ship "prompt → editable scene list" with no rendering yet.
   Validates the planning UX and the LangGraph plumbing before anything expensive happens.
2. **Per-scene codegen + render, sequential.** Wire steps 2–3 to run one scene at a time using the
   existing single-worker setup. No voiceover yet — just multiple silent clips concatenated. Proves
   the fan-out data model (`Scene` rows, per-scene status) end to end.
3. **Voiceover + duration sync + stitch.** Add TTS, the padding step, and the ffmpeg stitcher.
   This is the first version that produces an actual narrated video.
4. **Timeline editor.** Reordering, trimming, per-clip regenerate. This is where it starts to feel
   like Higgsfield instead of a batch pipeline.
5. **Scale-out.** Worker fleet, object storage, sandboxed execution, parallel scene fan-out instead
   of sequential. Do this once the product shape from 1–4 is validated, not before — it's the
   expensive infra work and you don't want to build it for a pipeline shape that's still changing.

Each phase is independently shippable and testable, which matters more than getting the "final"
architecture right on the first pass — the storyboard/graph shape in particular will change once
real users see what a generated plan looks like.
