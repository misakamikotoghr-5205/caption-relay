import { auditCues, exportSubtitles, validateCues, validateGlossary } from './captions';
import { glossaryCandidates, type CandidateDecision, type Proposal, type ReviewResult } from './agent';

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function fail(): never { throw new Error('Saved review does not match the validated request and literal glossary candidates.'); }

/** Offline validation/export only. This function never invokes a model or applies filesystem changes. */
export function exportReviewed(requestInput: unknown, savedResponse: unknown, acceptedCueIds: string[] = []) {
  if (!object(requestInput) || Object.keys(requestInput).some(k => !['cues', 'glossary'].includes(k))) fail();
  const original = validateCues(requestInput.cues), glossary = validateGlossary(requestInput.glossary ?? {});
  // An evidence envelope is supported only with the original request supplied separately.
  const response = object(savedResponse) && 'result' in savedResponse ? savedResponse.result : savedResponse;
  const fields = ['mode', 'model', 'proposals', 'toolTrace', 'error', 'decisions', 'text_source', 'decision_source'];
  if (!object(response) || Object.keys(response).some(k => !fields.includes(k)) ||
    !['ai', 'rules-only'].includes(response.mode as string) || !Array.isArray(response.proposals) ||
    response.proposals.length > 20 || !Array.isArray(response.toolTrace) || response.toolTrace.length > 10) fail();
  if (response.model !== undefined && (typeof response.model !== 'string' || response.model.length > 100)) fail();
  if (response.error !== undefined && (typeof response.error !== 'string' || response.error.length > 1000)) fail();
  for (const trace of response.toolTrace) {
    if (!object(trace) || Object.keys(trace).sort().join(',') !== 'result,tool' ||
      typeof trace.tool !== 'string' || trace.tool.length > 100 || typeof trace.result !== 'string' || trace.result.length > 10000) fail();
  }
  const candidates = new Map(original.flatMap(c => glossaryCandidates(c, glossary)).map(c => [c.candidateId, c]));
  const decisions: CandidateDecision[] = [], expected = new Map<string, Proposal>(), seen = new Set<string>();
  if (response.mode === 'ai') {
    if (response.text_source !== 'program-generated-literal-glossary-candidates' ||
      response.decision_source !== 'local-model-selection' || !Array.isArray(response.decisions) || response.decisions.length > 20) fail();
    for (const decision of response.decisions) {
      if (!object(decision) || Object.keys(decision).sort().join(',') !== 'candidateId,cueId,decision,reason' ||
        typeof decision.candidateId !== 'string' || typeof decision.cueId !== 'string' ||
        !['suggest', 'retain'].includes(decision.decision as string) || typeof decision.reason !== 'string' ||
        !decision.reason.trim() || decision.reason.length > 500) fail();
      const candidate = candidates.get(decision.candidateId);
      if (!candidate || candidate.cueId !== decision.cueId || seen.has(decision.cueId)) fail();
      // This checks saved trace consistency, not authenticity of a model call.
      if (!response.toolTrace.some(t => object(t) && t.tool === 'get_cue' &&
        typeof t.result === 'string' && t.result.startsWith(`Inspected ${candidate.cueId}: `))) fail();
      seen.add(decision.cueId);
      decisions.push({ candidateId: candidate.candidateId, cueId: candidate.cueId,
        decision: decision.decision as 'suggest' | 'retain', reason: decision.reason });
      if (decision.decision === 'suggest') expected.set(candidate.cueId,
        { cueId: candidate.cueId, text: candidate.candidateText, reason: decision.reason });
    }
  } else if (response.proposals.length || (response.decisions !== undefined &&
    (!Array.isArray(response.decisions) || response.decisions.length))) fail();
  const proposals: Proposal[] = [], proposed = new Set<string>();
  for (const proposal of response.proposals) {
    if (!object(proposal) || Object.keys(proposal).sort().join(',') !== 'cueId,reason,text' ||
      typeof proposal.cueId !== 'string' || proposed.has(proposal.cueId)) fail();
    const candidate = expected.get(proposal.cueId);
    if (!candidate || proposal.text !== candidate.text || proposal.reason !== candidate.reason) fail();
    proposed.add(proposal.cueId); proposals.push({ ...candidate });
  }
  if (proposed.size !== expected.size || !Array.isArray(acceptedCueIds) ||
    acceptedCueIds.some(id => typeof id !== 'string' || !proposed.has(id)) ||
    new Set(acceptedCueIds).size !== acceptedCueIds.length) fail();
  const accepted = new Set(acceptedCueIds);
  const current = original.map(c => accepted.has(c.id) ? { ...c, text: expected.get(c.id)!.text } : { ...c });
  const timingChanged = current.some((c, i) => c.startMs !== original[i].startMs || c.endMs !== original[i].endMs);
  if (timingChanged) fail();
  const agent = JSON.parse(JSON.stringify(response)) as ReviewResult;
  return {
    subtitles: { srt: exportSubtitles(current, 'srt'), vtt: exportSubtitles(current, 'vtt') },
    audit: {
      schemaVersion: 1, scope: 'Offline human-review replay of saved files; no fresh model invocation. Saved files and hashes do not prove model-call authenticity.',
      original, current, glossary, rules: { original: auditCues(original, glossary), current: auditCues(current, glossary) },
      agent, human: {
        accepted: original.filter(c => accepted.has(c.id)).map(c => c.id),
        retained: original.filter(c => !accepted.has(c.id)).map(c => c.id),
        proposalDecisions: proposals.map(p => ({ cueId: p.cueId, decision: accepted.has(p.cueId) ? 'accept' : 'retain-original' })),
        source: 'Explicit --accept cue IDs only; absent IDs retain the original. Retained cues may include unreviewed cues.',
      }, timingChanged,
    },
  };
}
