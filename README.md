# 字幕交接台 · Caption Relay

A local-first subtitle handoff prototype for the MINMAX AI Agent hackathon. Import plain SRT/VTT, inspect timing/reading-speed/terminology findings, ask a real local Ollama agent to **select or retain literal glossary candidates**, decide per cue, and export subtitles plus an audit JSON. Original timestamps never change.

## Run locally

Requires Node.js 22.13+ (tested with 24.22.0), npm, and a local Ollama installation. No accounts, API keys, payment cards or cloud inference are required. The subtitle UI and rule checks work without Ollama; the app then clearly reports `rules-only` and returns **no fabricated AI proposals**.

In terminal 1, start the local model server (skip this if it is already running):

```sh
ollama serve
```

In terminal 2, from this repository:

```sh
ollama pull qwen2.5:0.5b
npm ci
npm run dev -- --hostname 127.0.0.1 --port 5190
```

Open http://127.0.0.1:5190/ and load the original demonstration subtitles or import `fixtures/original.srt`. Run AI review, inspect its tool trace, accept or retain each suggestion, and download both outputs. Ollama may already be running; do not start a second server in that case. Model download is a one-time operation of about 398 MB for the tested small model. Download availability, system resources and model results vary. The small model can choose inappropriate candidates or no candidates; inspect every recommendation. On a heavily loaded CPU, a review can take several minutes. Local requests have nominal 120-second per-call and 360-second review timers; operating-system scheduling stalls can delay timers, so these are not hard wall-clock guarantees.

No test account is needed. Only bind to loopback. Subtitle and glossary content submitted to `/api/review` goes to the fixed **local Ollama HTTP service**. Files are processed in the browser and local server; the app has no database or automatic subtitle upload. The framework/package tooling may have its own network behavior. A remote Sites preview is owner-private and cannot reach a developer's loopback Ollama; it is not the judge-accessible AI runtime. Use these local instructions for evaluation.

## Boundaries

- Plain SRT and VTT are supported; rich styling/positioning is explicitly rejected rather than silently discarded. Consult parse errors for unsupported input.
- Rule findings are editing heuristics, not a certification of subtitle quality or accessibility compliance.
- The program generates literal glossary replacements, preserving all other text. The real model inspects cues and selects or retains known candidates with a reason; it cannot supply arbitrary replacement text. Unknown IDs, uninspected cues, timestamp changes and duplicate selections are rejected. This narrower design follows observed word deletion by the initial freeform prototype; historical raw failures are retained.
- Original text and timings, accepted/rejected proposals, remaining findings and actual tool records are included in the handoff JSON. Downloaded files stay under your control.
- Timing overlaps are **reported, not repaired**. Review them in your editing software. No speech recognition, transcription or translation service is included.
- The AI endpoint has batch/body/timeout limits and returns a clear error or rules-only result if unavailable. Run locally for personal use; this prototype is not a hardened multiuser service.
- `qwen2.5:0.5b` is a small Q4_K_M model, not an accuracy benchmark or a production quality claim.

## Project and submission

Created 2026-11-09 by Hengrui Guo, an individual developer with AI-assisted coding. See [business plan](docs/minmax-business-plan.md), [demo script](docs/demo-narration.md), and [official submission checklist](docs/minmax-submission.md). A repository, draft, or email send is not an official organizer acceptance. The UI has an editable `source=target` glossary; it locks for the current review, and restarting restores original subtitles for a new review.

On 2026-11-10, the project email was sent through Outlook and verified in Sent Items with the PDF and MP4 attached. **Organizer confirmation is pending; the questionnaire registration is not complete.** The sent packet corresponds to source revision `e28bb9f0a228fbb74b18852ef788bd268233427f`; these later documentation updates do not describe new code, model calls or footage. No official registration or final-entry receipt is claimed.

## Open source and comparisons

The app uses the supplied Sites Vinext starter, React/Next.js, Vinext/Vite, Tailwind CSS and Lucide icons; exact installed versions are in `package-lock.json`. Bundled vendor notices are retained. Ollama and Qwen2.5 are external runtime/model dependencies; weights are not distributed here. Read their own licenses before redistribution. [Subtitle Edit](https://github.com/SubtitleEdit/subtitleedit) is a much broader subtitle editor. It is referenced as a comparator, with no Subtitle Edit source copied into this app. This project focuses narrowly on timing-constrained, evidence-bearing human handoff and does not claim to invent subtitle editing.

Original project code is MIT licensed; third-party files retain their notices.

## Review an actual saved model response offline

To inspect a previously saved HTTP request/response without invoking the model again:

```sh
node scripts/export-reviewed.mjs --request request.json --response response.json --accept cue-2 --out outputs/reviewed-demo
```

Use the real `/api/review` request and response, or the retained evidence envelope with its matching request. Explicit `--accept` arguments choose which suggested cues to adopt; omitting them keeps all original cues. The destination must be new. This produces `reviewed.srt`, `reviewed.vtt`, and `audit.json`, checks that accepted text exactly matches known literal glossary candidates, preserves timings and hashes the two saved inputs. It is a saved-review workflow, not a fresh model call or proof that input files have never been tampered with.

Backend checks: `node --test tests/backend.test.mjs tests/handoff.test.mjs` (28 passed). A real local HTTP integration and an explicit saved-response export are documented in `docs/evidence/http-review-20261109.json`; historical model failures are retained alongside the successful candidate-selection probe. Initial browser import was checked; a complete final browser round trip remains unverified after the browser connection failed.
