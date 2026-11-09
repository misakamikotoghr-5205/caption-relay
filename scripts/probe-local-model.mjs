import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { get } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBackend } from '../tests/backend-loader.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const metadata = route => new Promise((resolve, reject) => {
  const req = get({ hostname: '127.0.0.1', port: 11434, path: route, timeout: 3000 }, res => {
    const chunks = []; let size = 0;
    res.on('data', chunk => { size += chunk.length; if (size > 100000) { req.destroy(); reject(new Error('Metadata limit exceeded.')); } else chunks.push(chunk); });
    res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch { reject(new Error('Invalid metadata.')); } });
  });
  req.on('timeout', () => { req.destroy(); reject(new Error('Metadata request timed out.')); });
  req.on('error', () => reject(new Error('Local Ollama is unavailable.')));
});
const backend = await loadBackend();
try {
  const tags = await metadata('/api/tags'), version = await metadata('/api/version');
  const input = await readFile(path.join(project, 'fixtures/model-probe.srt'), 'utf8');
  const cues = backend.captions.parseSubtitles(input);
  const before = JSON.stringify(cues), glossary = { 'caption relay': 'Caption Relay' };
  const calls = [], started = new Date().toISOString(), begin = performance.now();
  console.log('Starting one real local agent review; no mock transport, no paid API.');
  const result = await backend.agent.reviewCaptions(cues, glossary, {
    transport: async request => {
      const turn = calls.length + 1, start = performance.now();
      // This script uses only its fixed fictional fixture. Snapshot the actual
      // prompt/schema before the agent appends another tool result.
      const call = { turn, model: request.model, timeoutMs: request.timeoutMs,
        requestMessages: request.messages.map(message => ({ ...message })), outputSchema: request.schema };
      calls.push(call);
      try {
        // A logging wrapper around the actual production HTTP transport.
        call.rawResponse = await backend.agent.ollamaChat(request);
        call.elapsedMs = Math.round(performance.now() - start);
        console.log(`Real model turn ${turn} returned in ${call.elapsedMs}ms.`);
        return call.rawResponse;
      } catch (error) {
        call.elapsedMs = Math.round(performance.now() - start);
        call.error = error instanceof Error ? error.message : 'Transport failure.';
        throw error;
      }
    },
  });
  const used = tags.models?.find(m => m.name === `${result.model}:latest` || m.name === result.model);
  const record = {
    recordedAt: new Date().toISOString(), startedAt: started, elapsedMs: Math.round(performance.now() - begin),
    source: 'Actual production reviewCaptions and direct loopback ollamaChat; logging wrapper only, no mock.',
    architecture: 'The model selects or retains program-generated literal glossary candidates; the model cannot author subtitle text.',
    fixture: 'fixtures/model-probe.srt', fictionalInput: true, glossary,
    ollamaVersion: version.version, model: result.model,
    modelMetadata: used ? { name: used.name, digest: used.digest, size: used.size, details: used.details } : null,
    calls, result, inputUnchanged: JSON.stringify(cues) === before,
    immutableTiming: cues.map(({ id, startMs, endMs }) => ({ id, startMs, endMs })),
    sourceHashes: Object.fromEntries(await Promise.all(['lib/agent.ts', 'lib/captions.ts'].map(async file => [file,
      createHash('sha256').update(await readFile(path.join(project, file))).digest('hex')]))),
    limitations: [
      'This is a small fictional local probe, not a quality benchmark or a hosted-worker model verification.',
      'Rules are heuristics; neither audio alignment nor transcription accuracy was checked.',
      'All text suggestions need human review. Prompt-injection protections constrain capabilities, not semantic correctness.',
      'A rules-only result is retained as a real failure, never replaced with invented AI suggestions.',
    ],
  };
  const out = path.join(project, 'docs/evidence'); await mkdir(out, { recursive: true });
  let suffix = '', i = 1;
  while (true) { try { await access(path.join(out, `local-model-20261109${suffix}.json`)); suffix = `-${++i}`; } catch { break; } }
  const file = `local-model-20261109${suffix}.json`;
  const text = JSON.stringify(record, null, 2) + '\n';
  if (/\/home\/|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) throw new Error('Unexpected private value; evidence not written.');
  await writeFile(path.join(out, file), text);
  console.log(JSON.stringify({ evidence: `docs/evidence/${file}`, mode: result.mode, proposals: result.proposals.length,
    error: result.error ?? null, modelTurns: calls.length, inputUnchanged: record.inputUnchanged }));
} finally { await backend.cleanup(); }
