import { reviewCaptions } from '../../../lib/agent';
import { validateCues, validateGlossary } from '../../../lib/captions';

export const runtime = 'nodejs';
const MAX_BYTES = 250_000;

export async function POST(request: Request): Promise<Response> {
  const response = (data: unknown, status = 200) => Response.json(data, {
    status, headers: { 'cache-control': 'no-store' },
  });
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json'))
    return response({ error: 'Send an application/json body.' }, 415);
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_BYTES)
    return response({ error: 'Review input exceeds 250 KB.' }, 413);
  try {
    if (!request.body) throw new Error('A JSON body is required.');
    const reader = request.body.getReader(), chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > MAX_BYTES) { await reader.cancel(); return response({ error: 'Review input exceeds 250 KB.' }, 413); }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['cues', 'glossary'].includes(key)))
      throw new Error('The body accepts cues and optional glossary only.');
    const cues = validateCues(body.cues), glossary = validateGlossary(body.glossary ?? {});
    return response(await reviewCaptions(cues, glossary));
  } catch (error) {
    return response({ error: error instanceof Error ? error.message.slice(0, 200) : 'Invalid review input.' }, 400);
  }
}
