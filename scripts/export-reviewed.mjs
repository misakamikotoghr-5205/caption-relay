// Offline saved-review replay. This script never invokes the model.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { loadBackend } from '../tests/backend-loader.mjs';

const options = {}, accepted = [], args = process.argv.slice(2);
try {
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i], value = args[i + 1];
    if (!['--request', '--response', '--accept', '--out'].includes(key) || !value || value.startsWith('--'))
      throw new Error('Use --request request.json --response response.json [--accept cue-1] --out NEW-directory.');
    if (key === '--accept') accepted.push(value);
    else { if (options[key]) throw new Error('Duplicate option.'); options[key] = value; }
  }
  if (!options['--request'] || !options['--response'] || !options['--out'])
    throw new Error('Use --request request.json --response response.json [--accept cue-1] --out NEW-directory.');
  const requestBytes = await readFile(options['--request']), responseBytes = await readFile(options['--response']);
  if (requestBytes.length > 1000000 || responseBytes.length > 1000000) throw new Error('Saved inputs must each be at most 1 MB.');
  const backend = await loadBackend();
  try {
    const result = backend.handoff.exportReviewed(JSON.parse(requestBytes.toString('utf8')),
      JSON.parse(responseBytes.toString('utf8')), accepted);
    result.audit.savedInputs = {
      requestSha256: createHash('sha256').update(requestBytes).digest('hex'),
      responseSha256: createHash('sha256').update(responseBytes).digest('hex'),
      meaning: 'Hashes identify these local saved files only; they are not signatures or proof of model-call authenticity.',
    };
    result.audit.exportedAt = new Date().toISOString();
    const out = path.resolve(options['--out']);
    await mkdir(path.dirname(out), { recursive: true });
    await mkdir(out); // Refuse to overwrite any existing output directory.
    await writeFile(path.join(out, 'reviewed.srt'), result.subtitles.srt, { flag: 'wx' });
    await writeFile(path.join(out, 'reviewed.vtt'), result.subtitles.vtt, { flag: 'wx' });
    await writeFile(path.join(out, 'audit.json'), JSON.stringify(result.audit, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ mode: 'offline-saved-review', freshModelInvocations: 0,
      accepted: result.audit.human.accepted, retained: result.audit.human.retained, timingChanged: result.audit.timingChanged,
      files: ['reviewed.srt', 'reviewed.vtt', 'audit.json'] }));
  } finally { await backend.cleanup(); }
} catch (error) {
  // No source subtitle content, raw model output, file paths or credentials in errors.
  console.error(error?.code === 'EEXIST' ? 'Output directory already exists; choose a new one.' :
    error instanceof SyntaxError ? 'Saved input is not valid JSON.' :
    error?.code ? 'Could not read or write saved review files.' : error instanceof Error ? error.message : 'Saved review export failed.');
  process.exitCode = 1;
}
