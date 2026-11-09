# Backend verification snapshot — 2026-11-09

The backend implements plain SRT/VTT parsing and export, deterministic audit,
and bounded local-model selection of glossary candidates. It does not validate audio alignment,
transcription accuracy, accessibility compliance, or semantic correctness.

## Contracts and supported input

`lib/captions.ts` exports `Cue`, `Issue`, `parseSubtitles`, `auditCues` and
`exportSubtitles`. Timing is integer milliseconds and export preserves it.
The parser normalizes line endings and accepts VTT labels and NOTE blocks;
export uses internal cue IDs and does not retain labels or comments. VTT
STYLE/REGION blocks and positioning settings are rejected rather than silently
discarded. These are plain text subtitle tools, not a complete layout editor.
Unicode code points are used for the 20-character/s and 42-character heuristics.
Gaps and overlaps can be intentional; glossary flags reflect user-supplied terms.

`POST /api/review` accepts only `cues` and optional `glossary`, with a 250 KB body
limit. It does not accept a URL, model, path or executable tool from the client.
AI review batches are limited to 40 cues; larger valid documents retain their
rules audit and receive an explicit `rules-only` response.

The model selects read-only tools and must inspect a cue before recommending
one of its known glossary candidates. A maximum of three model turns is
permitted. Its final action is strictly
`{tool:"recommend",recommendations:[{candidateId,decision:"suggest"|"retain",reason}]}`;
an empty list is valid. Unknown candidates, duplicate decisions for a cue,
uninspected cues, extra fields, arbitrary replacement text and timestamps are
rejected. There is no model subtitle-writing capability. Reading-speed, line,
gap and overlap findings remain heuristic flags for human editing.

The external `proposals` array still contains `{cueId,text,reason}` for UI
compatibility. Its **text comes exclusively from the identified program-generated
candidate**; the model supplies the selection and explanation. A completed AI
review declares `text_source: 'program-generated-literal-glossary-candidates'`,
`decision_source: 'local-model-selection'` and explicit `decisions`. A `retain`
decision produces no text proposal. A failed model review returns no proposals;
rules are never relabeled as AI. Timing and source cues remain unchanged.
These guards limit capabilities; they do not prove contextual correctness.
Human approval is still required before applying any glossary replacement.

`get_cue` also returns that cue's heuristic issues and optional literal glossary
replacement candidates. These candidates are explicitly **program-generated**,
not model output; the model can decline them and the application does not apply
them. Candidates retain all surrounding source text and substitute only literal
matches of one user-supplied glossary entry, using the supplied target exactly.
An unchanged replacement never becomes a candidate. A completed AI review can
return `mode: 'ai'` and an empty proposal list without forcing an edit.

The server transport directly targets `127.0.0.1:11434/api/chat`, ignores proxy
environment variables and refuses HTTP redirects. There is no auto-download or
cloud model. The reproducible default is the official `qwen2.5:0.5b` tag;
`CAPTION_RELAY_OLLAMA_MODEL` is a server-only local-model allowlist override.
Hosted workers do not inherit this computer's localhost model service. A
deployed UI must not be described as model-enabled without its own verification.

## Offline checks

The following passed: **28 tests** (26 backend and 2 offline export tests) and
a dedicated strict TypeScript check.
The tests transpile the actual backend sources into an isolated temporary
directory. Model transports in these tests are mocks; no model or network is
called. HTTP interception tests exercise the actual fixed-destination transport.

```sh
node --test tests/backend.test.mjs tests/handoff.test.mjs
node node_modules/typescript/bin/tsc --noEmit --skipLibCheck --strict --target ES2022 --module ESNext --moduleResolution Bundler --types node lib/captions.ts lib/agent.ts lib/handoff.ts app/api/review/route.ts
```

Tests cover format round trips, malformed timing, nested overlap coverage,
Unicode counting, glossary regex escaping, immutable input, malicious or invalid
model recommendations, untrusted instruction text, tool budget, explicit model failure,
batch limits, HTTP upload limits, proxy/redirect protection and concurrent calls.
Selection regressions verify exact full-text candidate resolution and provenance,
retain/empty outcomes, scoped data without automatic adoption, and literal
regex/replacement syntax. They also reject arbitrary text/deletion, old freeform
actions, unknown IDs, uninspected cues, and duplicate candidates or cue decisions.
These checks are separate from the owner's build and browser verification.

## Initial real local probes: preserved failures

`node scripts/probe-local-model.mjs` uses the production agent and HTTP transport
with only a logging wrapper, two original fictional cues and a supplied glossary.
It never supplies fake model responses and retains existing evidence on rerun.
The first three actual probes returned `rules-only`, zero proposals and unchanged
input. Their records are [run 1](evidence/local-model-20261109.json),
[run 2](evidence/local-model-20261109-2.json), and
[run 3](evidence/local-model-20261109-3.json).

The first runner failed to load before cancellation. Subsequent loading reached
ready, but the final initial request spent 35.207 seconds evaluating 259 prompt
tokens and 10.503 seconds generating 22 tokens, exceeding the nominal 45-second
timer. A single [empty warmup](evidence/model-warmup-20261109.json) completed with
HTTP 200 and zero output characters; it was not an agent review. That warmup used
context 2048, not 512; no immediate post-warmup `/api/ps` query was made.

The observed initial probe durations were 259.421, 46.265 and 45.876 seconds.
The first substantially exceeded its configured timer under the observed machine
conditions; no exact scheduling or memory cause was established. JavaScript
timers must not be advertised as strict wall-clock guarantees. See the
[sanitized runtime metrics](evidence/runtime-metrics-20261109.json).

The owner subsequently increased the configured request and total budgets;
later owner-led probes and UI results are separate evidence, not substituted for
these failures. Consult the current source and README for the current limits.
No successful AI suggestion, hosted inference, video, submission or competition
acceptance is established by this initial-probe snapshot.

## Subsequent bounded review and quality limitation

The owner's [fourth real probe](evidence/local-model-20261109-4.json) completed
three model turns in 201.355 seconds but returned the original text unchanged.
Its historical record is preserved; that output is not a useful correction.
The then-current validator was changed to omit unchanged proposals after full
validation; that freeform architecture has since been replaced as described above.

After adding explicitly program-generated optional glossary candidates, exactly
one [fifth real probe](evidence/local-model-20261109-5.json) ran the production
agent and real loopback transport, using the same original fictional fixture
and official `qwen2.5:0.5b` model. It completed in 30.503 seconds with three
model turns: inspect cue 1, inspect cue 2, then propose. Its one structurally
valid proposal was `caption relay`, replacing `Welcome to caption relay.`.
This drops original wording and ignores the supplied target's capitalization;
it should be **rejected by the human reviewer**, not described as a successful
glossary correction. The reason mentioning the desired term does not repair
the proposed text. Source cues and all timestamps remained unchanged.

The raw responses and all earlier failures remain intact. The current nominal
limits are 120 seconds per request and 360 seconds for the review, with a
10-minute model keep-alive. No further model retries were made for that quality
iteration. See the [historical bounded assessment](evidence/local-model-20261109-assessment.md).

## Candidate-selection-only production probe

The capability was deliberately narrowed after the observed deletion in run 5:
the model now chooses or retains identified literal glossary candidates and can
explain its choice, but cannot write subtitle text. Exactly one new real
[run 6](evidence/local-model-20261109-6.json) exercised this architecture with
the same two original fictional cues and official `qwen2.5:0.5b` model. It
completed three turns in 63.690 seconds, exit code 0. The record includes the
exact messages and output schemas sent to the real production adapter, its
untouched raw model responses, the source hashes and explicit text provenance.

The model inspected cue 1 twice, then selected `candidate:cue-1:1` with decision
`suggest` and a reason. The program resolved that known ID to the full literal
candidate `Welcome to Caption Relay.`; the model did not author that subtitle
text. Cue 2 was not inspected or recommended, so this is not full-document
review. The returned result contained one proposal for human approval, and the
source cues and timestamps remained unchanged. No automatic application, UI
approval, audio verification or hosted inference was performed by this probe.
No further model requests followed for this architecture iteration. The
[candidate selection assessment](evidence/candidate-selection-20261109.md)
states the workflow and limits separately from the earlier failed architecture.

## Offline human-review export

Save the original request as JSON `{cues,glossary}` and the actual API response
separately. A recorded evidence JSON with a `result` property is also accepted,
provided the matching original request is supplied. This helper makes **no
fresh model call**:

```sh
node scripts/export-reviewed.mjs --request request.json --response response.json --accept cue-1 --out outputs/reviewed-demo
```

The output directory must be new. Repeat `--accept` for additional proposed
cue IDs; omitting it retains every original. The helper exports `reviewed.srt`,
`reviewed.vtt` and `audit.json`. It validates the saved response against the
current shared literal-candidate generator, including IDs, decisions, exact
full text, reasons and saved inspection-trace consistency. Unknown/duplicate
IDs, arbitrary replacement text, timing fields and unsupported acceptance are
rejected. The original and current subtitle states, rules audits, saved agent
result, explicit human decisions, unchanged-timing flag and input-file hashes
are recorded. Retained cues can include cues the model never inspected.

The hashes identify the supplied local files; they are not signatures and do
not establish that a model call occurred. The helper does not contact a server,
publish files or certify subtitle quality. `lib/handoff.ts` shares the actual
candidate generator; making that existing function public changed the source
hash after run 6 without changing its generation behavior. The recorded run 6
hash remains the accurate hash of the version actually invoked.
