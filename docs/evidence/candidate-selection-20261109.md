# Real candidate-selection probe — 2026-11-09

## What changed and why

The earlier freeform model could delete original wording while still producing
structurally valid output. All five earlier raw probe records remain intact.
The production model's capability is now **glossary candidate triage**, not
subtitle authoring. The program generates optional full-text candidates by
literal substitution of one user-supplied glossary source/target pair. All
surrounding text stays unchanged; targets use exactly the supplied spelling.
An unchanged result is not offered as a candidate.

The model can use read-only tools to inspect a cue, its heuristic flags and its
candidate IDs/text. It may select a known candidate with `suggest`, retain the
original with `retain`, or return an empty list. It supplies a contextual reason,
not subtitle text. The runtime rejects arbitrary text, timing fields, unknown
IDs, uninspected cues and duplicate decisions for the same cue. At most one
candidate per cue can be recommended in a review. Any suggestion still requires
human approval; a supplied glossary is not proof of semantic correctness.

The API retains `{cueId,text,reason}` proposals for the UI. The text is resolved
from a validated candidate ID, with separate `text_source` and `decision_source`
fields and explicit model decisions. No deterministic suggestion is relabeled
as model-authored subtitle text. Readability, gaps and overlaps remain heuristic
flags for human editing, outside the model's editing capability.

## One actual production run

[Run 6](local-model-20261109-6.json) is a real invocation of `reviewCaptions`
and the production direct-loopback HTTP transport, with a logging wrapper only.
It uses the unchanged fictional `fixtures/model-probe.srt` and supplied glossary
`caption relay` → `Caption Relay`. The official installed model is
`qwen2.5:0.5b`, Q4_K_M. There was no paid API, cloud inference or model download.
The record preserves exact actual request messages, schemas and raw responses.

- Start: 2026-11-09 07:39:25.302 UTC.
- Completion recorded: 07:40:29.027 UTC; measured review: 63.690 seconds.
- Process exit: 0. Model turns: 3 (20.842, 15.406 and 27.421 seconds).
- Actual tools: `get_cue` for cue 1, `get_cue` for cue 1 again, then `recommend`.
- Actual model decision: `candidate:cue-1:1`, `suggest`.
- Actual model reason: `The term 'Caption Relay' is intended in the context of caption relay.`
- Program-resolved proposal: `Welcome to Caption Relay.`
- Original source text: `Welcome to caption relay.`
- Source input and every timestamp: unchanged. No proposal was applied.

This demonstrates one real model-selected literal glossary correction for
human review. The model **did not inspect or recommend cue 2**. Do not claim
full-document coverage, independent subtitle generation, audio alignment,
transcription accuracy, UI approval or hosted-worker inference. The reason is
a small model's judgment, not a verified fact. No second model probe was made
for this architecture iteration.

## Verification

The 26 backend tests and strict TypeScript command in
[backend verification](../backend-verification.md) passed. Tests use explicit
mock responses and independently cover suggest/retain/empty decisions, exact
candidate resolution/provenance, scoped tools, immutable input, literal regex
and replacement syntax, arbitrary text rejection, invalid/unknown/duplicate
IDs, mandatory inspection, bounded turns, failure handling, upload limits,
proxy/redirect protection and concurrency. They are separate from the actual
run above.

Production limits remain nominally 120 seconds per request, 360 seconds total,
three model turns, one concurrent review and 10-minute keep-alive. Earlier
observed OS stalls mean JavaScript timers are not strict wall-clock guarantees.
