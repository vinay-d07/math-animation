# Learnings

Running log of non-obvious things discovered while building this. Kept for
future-me and for talking through the project (resume/portfolio context,
not a production SaaS) — the point is to capture *why* a decision was made,
not just what the code does.

## 1. "The video is too short" was a planning bug, not a rendering bug

Symptom: SHORT mode (meant to produce a 2-5 min narrated explainer) was
sometimes producing a 26-second video.

The instinct is to suspect the render pipeline — maybe audio/video aren't
syncing, maybe scenes get truncated. They weren't. The pipeline already did
the hard part correctly:

- `generateNarrationAudio.ts` generates each scene's TTS audio *before*
  rendering.
- `sandboxRenderer.ts` measures the audio's real duration with `ffprobe`
  and pads the rendered clip (`ffmpeg tpad`) to match it exactly if the
  animation finishes first.
- `videoConcat.ts` concatenates every scene losslessly (`-c copy`, no
  re-encode) into the final file.

So per-scene audio/video sync was never the bug — it's actually a solid
design already. The real gap: `planStoryboard.ts` only *told* the LLM in
prose to "budget 300-750 words total" for a 2-5 min video. Nothing checked
that afterward. A `generateObject` call constrained to a JSON schema
reliably undershoots a soft aggregate instruction like that — the model
satisfies the schema (valid scenes, valid field lengths) without satisfying
the *sum* across scenes, because nothing in the schema encodes "sum of X
across array must exceed N."

**Lesson:** an LLM instruction that describes a constraint on an
*aggregate* (total words, total duration, total cost) needs to be verified
in code and retried/expanded on failure. Schema validation only catches
per-field violations, not properties of the whole output. If it matters,
count it yourself after the fact.

Fix: `planStoryboard.ts` now computes total narration word count after
generation; if it's under a 300-word floor (~2 min at ~150wpm), it sends
the storyboard back to the model with its actual word count and asks for a
real revision (deepen existing scenes / add scenes), up to 2 attempts,
keeping whichever attempt is longer.

## 2. One free-tier API key means one shared failure domain

Every text-generation call in this app — storyboard planning, storyboard
expansion, per-scene Manim codegen, and the AI scene-editor — went through
one `llmProvider` bound to one Groq API key and one model
(`openai/gpt-oss-120b`). That model's free tier caps out at **8,000 tokens
per minute, org-wide** — not per endpoint, not per feature, per *org*.

The failure mode this produces isn't obvious from any single call site: a
single video generation runs storyboard planning, then up to 3 scenes
codegen'ing *concurrently* (`SCENE_GENERATION_CONCURRENCY`), each a
few-hundred-to-thousand-token call. That alone can exhaust an 8K/min budget
before a second user even shows up. Adding a retry/expansion loop to fix
learning #1 made this measurably worse — more calls, more often, into the
same tiny bucket.

**Lesson:** when every feature shares one upstream credential, "add a
retry" and "add a smarter prompt" are both just different ways of using
more of the same scarce resource. The fix isn't purely local — it's
allocating which call sites compete for which bucket.

Fix, in order of what actually moved the needle:
1. `withRateLimitRetry.ts` — parse Groq's exact `"try again in Xs"` from
   the 429 body and back off for that long instead of failing after N
   attempts. Free, and correct regardless of anything else below.
2. Trim what gets sent on retries. The expansion prompt used to resend the
   *entire* previous storyboard as JSON (title, every scene's narration +
   visualIntent + explanation); now it sends only `sceneClassName` +
   `narration` per scene — plenty of context to extend coherently, at a
   fraction of the input tokens on a budget where every token counts.
3. Split call sites across two independent free-tier buckets (see #3
   below) instead of fighting over one.

## 3. Groq vs. Cerebras free tiers are opposite shapes — route by call pattern, don't just pick one

Checked both providers' current published limits (these move fast, so
these are 2026 snapshot numbers, verify at time of reading):

| | Groq free (`openai/gpt-oss-120b`) | Cerebras free (`gpt-oss-120b`) |
|---|---|---|
| Requests/min | 30 | **5** |
| Tokens/min | **8,000** | 30,000 |
| Tokens/day | ~14,400 req/day-ish (varies by model) | 1,000,000 |
| Cost | $0 | $0 (no card required) |

Neither is "just better." Groq gives 3.75x the request rate but a quarter
of the token budget; Cerebras is the mirror image. That maps almost
exactly onto two different call patterns already in this codebase:

- **Storyboard planning**: infrequent (1-3 calls per video), each call
  large (a full multi-scene JSON schema response), latency-tolerant (user
  is waiting on a "Plan" click, not mid-conversation). This wants *tokens*,
  not *requests* → Cerebras.
- **Scene codegen + AI-edit streaming**: frequent, concurrent (3 scenes at
  once), each call individually smaller, and AI-edit specifically is a
  human staring at a stream waiting for it to start. This wants *request
  rate* and low latency → Groq.

Routing by pattern rather than picking one provider for everything doubles
effective free throughput at zero cost, because the two limits are on
completely separate infrastructure and don't share a bucket. Implemented
as `planningLlmProvider` (Cerebras, falls back to Groq if unconfigured)
alongside the existing `llmProvider` (Groq) in `provider.ts`.

**Lesson:** rate limits are a *shape*, not just a number. "Which provider
has the higher limit" is the wrong question if your workload isn't uniform
— the right question is which shape matches which call site.

## 4. BYOK (bring-your-own-key) is a persistence-policy decision before it's a code change

The obvious way to let users plug in their own paid OpenAI/Anthropic/Google
key is a settings page that saves it to their `User` record. For a
resume/portfolio project specifically, that's the wrong default:

- It means the app now custodies other people's third-party API
  credentials at rest — a real security liability (needs encryption,
  key-rotation story, breach-notification thinking) for a feature that
  doesn't actually need persistence to work.
- The safer, still-fully-functional design: accept the key **per
  generation request only**, hold it in memory for the duration of that
  one call, never write it to the database, never log it. Users who want
  convenience can have the frontend remember it in `localStorage` (their
  browser, their choice) — the backend simply never becomes a store of
  other people's secrets.

**Lesson:** "should this be persisted" is a design question that should be
answered *before* "where does it go in the schema," especially for
anything that's a credential. The absence of a feature (persistence) can
be the more defensible engineering choice, not a corner cut.

## 5. Rented inference vs. owned inference is the actual ceiling, not a bug to code around

Looked at how a real scaled AI video platform (Higgsfield) handles this
class of problem, since "how do they avoid rate limits" was a natural
question once ours kept tripping one.

They don't hit this problem because they're not a *tenant* on someone
else's API: they run their own diffusion models on owned/leased NVIDIA
GPU clusters (HGX B200/B300, InfiniBand/NCCL), with generation requests
queued through Redis/RabbitMQ + a Celery-style DAG orchestrator to a fleet
of GPU workers, monitored fleet-wide with DCGM/NVSentinel. Their
equivalent of "rate limiting" is capacity planning across hardware they
own, not a fixed quota from a vendor.

This app is deliberately on the other end of that spectrum — Groq for
inference, E2B for sandboxed rendering — which is the *correct* choice at
this scale and budget (nobody should be racking GPUs for a portfolio
project). But it means the free-tier TPM cap is a real, structural ceiling,
not a bug. The fixes available at this scale are: (a) spend real, small
money to raise the ceiling (see #6), or (b) get smarter about which calls
compete for it (see #3). There is no code change that removes a vendor's
quota.

**Lesson:** know which side of the "rent vs. own" line your infra is on
before trying to engineer your way out of a limit that's actually a
billing decision.

Sources checked: [NVIDIA/Higgsfield case study](https://www.nvidia.com/en-us/case-studies/higgsfield/),
[Nebius/Higgsfield case study](https://nebius.com/customer-stories/higgsfield-ai).

## 6. Cheapest real fix, if/when the free tiers stop being enough

Groq's paid tier is usage-based (pay per token), not a subscription — the
free-tier 429 error itself links straight to it
(`console.groq.com/settings/billing`). For a project at this traffic
volume, adding a payment method there is the single highest-leverage
dollar available: it removes the 8K TPM ceiling outright for what would
realistically be cents of usage, versus committing to any fixed-cost
plan elsewhere. Not worth it: a subscription-tier model provider (OpenAI
Plus-style plans, etc.) purely for this — fixed monthly cost doesn't suit
bursty, low-volume, portfolio-project traffic. Pay-per-token does.

## 7. Scene render failures can be API hallucination, not a broken sandbox

Symptom: a scene failed with `AttributeError: Axes object has no attribute
'background_lines'`, right after also calling `axes.get_graph(...)`.
First instinct was to suspect the sandbox — missing dependency, wrong
package version.

It wasn't. `sandbox-template/e2b.Dockerfile` pins
`manim>=0.18.0,<0.20` (Manim **Community Edition**) and nothing was
missing. Both APIs the model used are real — just from **ManimGL**,
3b1b's separate, incompatible library that also happens to be called
"manim" and shares a lot of surface-level naming with Community Edition
(`get_graph` vs `.plot()`, `.background_lines` as a real `NumberPlane`
attribute in ManimGL vs. not existing at all in Community). Training data
for "manim" inevitably mixes both libraries, so the model reproduces
whichever version it saw more of for a given pattern — sometimes the
wrong one.

**Lesson:** when generated code fails against a real, installed API
surface, check whether the failing call is a *plausible-but-wrong* API
from a same-named sibling library before assuming a dependency or
environment problem. The fix isn't infrastructure — it's naming the
specific confusion in the system prompt (`generateSceneCode.ts` and
`editScene.ts` now both explicitly ban the ManimGL-only APIs and name the
Community Edition replacement for each).
