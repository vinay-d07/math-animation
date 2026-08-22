What's actually standing between here and "reliable, upload-ready, 2-3min"

Today's fixes closed two structural bugs (unenforced narration length, shared rate-limit bucket) and one hallucination class. But there's a bigger structural risk left that none of those touch: the pipeline is all-or-nothing. videoGeneration.ts aborts the entire project the moment one scene exhausts its 2 retries (MAX_SCENE_ATTEMPTS). With up to 10 scng the dice on an open, free-tier model writing constrained Python, the odds that at least one scene fails twice compound fast across a whole
video — that's the thing most likely ttead of "a 2-3min video," even aftereverything fixed today.

That's the top priority. Everything else is secondary to it.

Reliability — make it always produce something uploadable

- Graceful degradation instead of abort. If a scene fails all retries, don't kill the project — fall back  to a minimal, near-guaranteed-to-rendeation text on screen, muxed with itsreal narration audio, no complex animation) instead of failing the whole video. You still get every second of duration and a complete, watchable  one scene instead of losingeverything. This is the single highest-leverage change for "ready to upload" — bigger than any rate-limit or prompt fix.
- Fewer, longer scenes instead of many short ones. Right now SHORT mode allows up to 10 scenes. Capping it
lower (say 6-8) for the same 2-3min tachances to fail, fewer render waves,and less total wall-clock time — a rare case where reliability and delay both improve from the same
change.
- Retry budget is a delay/reliability dial, not free — each retry is a full LLM call and a full sandbox
render (tens of seconds to ~90s). Moreut more worst-case delay. Givendegradation-instead-of-abort above, this can probably stay at 2 rather than being pushed higher.

Delay — where the time actually goes

- Per-scene render is the long pole, not the LLM calls (once rate limits aren't an issue). With SCENE_GENERATION_CONCURRENCY=3 and up ntial waves of ~30-90s renders —several minutes just for the parallel stage. Fewer scenes (above) directly cuts this.                      - Raising concurrency is a lever, bounrent-sandbox limit and by notre-triggering the Groq codegen rate limit — worth testing incrementally, not free.                         - The final concat step spins up a whoto run ffmpeg -f concat. videoConcat.ts already notes concatenating trusted, already-rendered clips isn't a security boundary the way untrusted    scene code is — so this could run direnstead (needs ffmpeg on that hostimage), skipping a sandbox cold-start plus an extra upload/download round trip. Real delay savings for one dependency added.

BYOK — the option that actually addresg

A meaningful chunk of scene failures (stakes) are a model-capability problem, not just a prompting one — prompt guardrails patch around it but don't eliminate it. A frontier model
(GPT-4/5-class, Claude, Gemini) makes ic mistakes than a free-tier open 120bmodel. So BYOK isn't just "let power users bring a key" — it's the highest-ceiling lever for reliability
and output quality, specifically for tghest-stakes call in the wholepipeline).

Shape of it, no persistence complexity: accept a key per-generation-request only (never stored server-side — discussed and decided against persis, used for that one video's codegencalls, with the app's own Groq/Cerebras keys as the default so it still works with zero setup. Planning can stay on the free tier regardless —s a much easier task than writingcorrect, frame-constrained Manim code, so there's little quality upside to BYOK there.                  
Is this all moving in the right direction?                                                              
Yes, directionally — today's fixes were the correct root causes, not band-aids: an unenforced aggregate constraint, a shared rate-limit bucketnd a specific hallucination class nownamed explicitly in the prompt. None of that was wasted.                                                
But be clear-eyed: none of today's fixes touch the all-or-nothing failure mode, and that's now the most likely remaining reason a SHORT video ad of a finished file. If I weresequencing what's left: graceful degradation first (turns "sometimes nothing" into "always something"), scene-count reduction second (helps bofree), BYOK for codegen third (thequality ceiling-raiser, worth it once the pipeline reliably finishes), concurrency/host-side-ffmpeg last (pure delay polish, do it once the abog). Chasing delay before fixing theabort-on-first-failure behavior would be optimizing the wrong thing — a fast pipeline that still sometimes produces nothing isn't "usable" yet.