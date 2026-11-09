import test, { after, mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { loadBackend } from './backend-loader.mjs';
const { captions: C, agent: A, handoff: H, cleanup } = await loadBackend();
after(cleanup);

function fixture() {
  const request = { cues: [
    { id: 'cue-1', index: 1, startMs: 0, endMs: 3000, text: 'Welcome to caption relay.' },
    { id: 'cue-2', index: 2, startMs: 3200, endMs: 6200, text: 'caption relay keeps the original timing.' },
  ], glossary: { 'caption relay': 'Caption Relay' } };
  const candidate = A.glossaryCandidates(request.cues[0], request.glossary)[0];
  // Explicit mock saved response for offline validation tests; no model claim.
  const response = { mode: 'ai', model: 'qwen2.5:0.5b',
    text_source: 'program-generated-literal-glossary-candidates', decision_source: 'local-model-selection',
    proposals: [{ cueId: 'cue-1', text: candidate.candidateText, reason: 'Mock glossary selection for an export test.' }],
    decisions: [{ candidateId: candidate.candidateId, cueId: 'cue-1', decision: 'suggest', reason: 'Mock glossary selection for an export test.' }],
    toolTrace: [{ tool: 'get_cue', result: 'Inspected cue-1: mocked fixture trace, not model evidence.' }],
  };
  return { request, response };
}

test('offline replay accepts only the explicit literal selection, exports both formats and preserves other text/timing', () => {
  const { request, response } = fixture(), before = JSON.stringify({ request, response });
  let networkCalls = 0;
  const stub = mock.method(http, 'request', () => { networkCalls++; throw new Error('No network allowed for offline replay.'); });
  syncBuiltinESMExports();
  try {
    const result = H.exportReviewed(request, { result: response, ignoredEnvelopeMetadata: 'not copied' }, ['cue-1']);
    assert.equal(result.audit.current[0].text, 'Welcome to Caption Relay.');
    assert.equal(result.audit.current[1].text, request.cues[1].text);
    assert.deepEqual(result.audit.human.accepted, ['cue-1']); assert.deepEqual(result.audit.human.retained, ['cue-2']);
    assert.equal(result.audit.timingChanged, false);
    assert.deepEqual(C.parseSubtitles(result.subtitles.srt), result.audit.current);
    assert.deepEqual(C.parseSubtitles(result.subtitles.vtt), result.audit.current);
    assert.deepEqual(result.audit.current.map(c => [c.startMs, c.endMs]), request.cues.map(c => [c.startMs, c.endMs]));
    assert.deepEqual(H.exportReviewed(request, response).audit.current, request.cues);
    assert.equal(JSON.stringify({ request, response }), before); assert.equal(networkCalls, 0);
  } finally { stub.mock.restore(); syncBuiltinESMExports(); }
});

test('offline replay rejects arbitrary/deleted text, timing fields, unknown/duplicate IDs and unsupported human acceptance', () => {
  const { request, response } = fixture();
  for (const alter of [
    r => { r.proposals[0].text = 'caption relay'; },
    r => { r.proposals[0].startMs = 1; },
    r => { r.decisions[0].candidateId = 'unknown'; },
    r => { r.decisions.push({ ...r.decisions[0] }); },
    r => { r.proposals.push({ ...r.proposals[0] }); },
    r => { r.decisions[0].decision = 'retain'; },
    r => { r.toolTrace = []; },
  ]) {
    const invalid = structuredClone(response); alter(invalid);
    assert.throws(() => H.exportReviewed(request, invalid, ['cue-1']), /Saved review does not match/);
  }
  assert.throws(() => H.exportReviewed(request, response, ['cue-2']));
  assert.throws(() => H.exportReviewed(request, response, ['cue-1', 'cue-1']));
  assert.deepEqual(H.exportReviewed(request, { mode: 'rules-only', proposals: [], toolTrace: [], error: 'Mock model failure.' }).audit.current, request.cues);
});
