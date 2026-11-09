export type Cue = {
  id: string;
  index: number;
  startMs: number;
  endMs: number;
  text: string;
};

export type Issue = {
  cueId: string;
  kind: 'overlap' | 'too-fast' | 'long-line' | 'gap' | 'terminology';
  severity: 'warning' | 'info';
  message: string;
};

export const MAX_CUES = 1000;
const MAX_TEXT_BYTES = 1_000_000;
const MAX_TIME_MS = 7 * 24 * 60 * 60 * 1000;

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function validateCueText(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 4000)
    throw new Error('Each cue needs nonempty text of at most 4,000 characters.');
  if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value) || /\n\s*\n/.test(value))
    throw new Error('Cue text contains unsupported controls or an empty line that would split the cue.');
  if (/(?:^|\n)\s*(?:\d+:)?\d{2}:\d{2}[,.]\d{3}\s*-->/.test(value))
    throw new Error('Cue text cannot contain a second timestamp header.');
  return value;
}

export function validateCues(value: unknown): Cue[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_CUES)
    throw new Error(`Provide between 1 and ${MAX_CUES} cues.`);
  const ids = new Set<string>();
  const indexes = new Set<number>();
  let characters = 0;
  return value.map(cue => {
    if (!object(cue) || Object.keys(cue).some(k => !['id', 'index', 'startMs', 'endMs', 'text'].includes(k)))
      throw new Error('Cue fields must be id, index, startMs, endMs and text.');
    const { id, index, startMs, endMs } = cue;
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_.:-]{1,64}$/.test(id) || ids.has(id))
      throw new Error('Cue IDs must be unique, short plain identifiers.');
    if (!Number.isSafeInteger(index) || (index as number) < 1 || indexes.has(index as number))
      throw new Error('Cue indexes must be unique positive integers.');
    if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs) ||
      (startMs as number) < 0 || (endMs as number) <= (startMs as number) || (endMs as number) > MAX_TIME_MS)
      throw new Error('Cue timing needs integer milliseconds, a positive duration and a range within seven days.');
    const text = validateCueText(cue.text);
    characters += text.length;
    if (characters > 120_000) throw new Error('The combined caption text exceeds 120,000 characters.');
    ids.add(id); indexes.add(index as number);
    return { id, index: index as number, startMs: startMs as number, endMs: endMs as number, text };
  });
}

export function validateGlossary(value: unknown = {}): Record<string, string> {
  if (!object(value) || Object.keys(value).length > 24)
    throw new Error('The glossary must be an object with at most 24 entries.');
  const result: Record<string, string> = Object.create(null);
  for (const [source, preferred] of Object.entries(value)) {
    if (!source.trim() || source.length > 60 || typeof preferred !== 'string' ||
      !preferred.trim() || preferred.length > 100 || /[\r\n\u0000]/.test(source + preferred))
      throw new Error('Glossary terms must be short, nonempty single-line strings.');
    result[source] = preferred;
  }
  return result;
}

function timestamp(value: string, format: 'srt' | 'vtt'): number {
  const re = format === 'srt' ? /^(\d{2,}):(\d{2}):(\d{2}),(\d{3})$/ : /^(?:(\d{2,}):)?(\d{2}):(\d{2})\.(\d{3})$/;
  const match = value.match(re);
  if (!match) throw new Error(`Invalid ${format.toUpperCase()} timestamp.`);
  const hours = Number(match[1] ?? 0), minutes = Number(match[2]), seconds = Number(match[3]);
  if (minutes > 59 || seconds > 59) throw new Error('Timestamp minutes and seconds must be below 60.');
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + Number(match[4]);
}

/** Plain text SRT/VTT. Layout settings and STYLE/REGION blocks are rejected, not silently discarded. */
export function parseSubtitles(input: string, format?: 'srt' | 'vtt'): Cue[] {
  if (typeof input !== 'string' || new TextEncoder().encode(input).length > MAX_TEXT_BYTES)
    throw new Error('Subtitle input must be text no larger than 1 MB.');
  let text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  const detected = /^WEBVTT(?:[ \t].*)?(?:\n|$)/.test(text) ? 'vtt' : 'srt';
  const kind = format ?? detected;
  if (kind !== 'srt' && kind !== 'vtt') throw new Error('Choose SRT or VTT.');
  if (kind === 'vtt') {
    if (detected !== 'vtt') throw new Error('VTT input must begin with WEBVTT.');
    const newline = text.indexOf('\n');
    text = newline < 0 ? '' : text.slice(newline + 1).trim();
  } else if (detected === 'vtt') throw new Error('A WEBVTT header is not SRT.');
  const cues: Cue[] = [];
  for (const block of text.split(/\n[ \t]*\n+/).filter(Boolean)) {
    const lines = block.split('\n');
    if (kind === 'vtt' && /^NOTE(?:[ \t]|$)/.test(lines[0])) continue;
    if (kind === 'vtt' && /^(STYLE|REGION)(?:[ \t]|$)/.test(lines[0]))
      throw new Error('VTT STYLE/REGION metadata is not supported; use plain text captions.');
    let index = cues.length + 1;
    if (kind === 'srt') {
      if (!/^\d+$/.test(lines[0])) throw new Error('Each SRT block must begin with a numeric index.');
      index = Number(lines.shift());
    } else if (!lines[0]?.includes('-->')) {
      lines.shift(); // Optional VTT cue label; stable internal IDs are generated below.
    }
    const timing = lines.shift()?.match(/^(\S+)\s+-->\s+(\S+)$/);
    if (!timing) throw new Error('Each cue needs a plain timestamp range; layout settings are not supported.');
    cues.push({ id: `cue-${cues.length + 1}`, index,
      startMs: timestamp(timing[1], kind), endMs: timestamp(timing[2], kind),
      text: lines.join('\n') });
  }
  return validateCues(cues);
}

function formatTime(ms: number, format: 'srt' | 'vtt'): string {
  const pad = (n: number, length = 2) => String(n).padStart(length, '0');
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor(ms / 60_000) % 60;
  const seconds = Math.floor(ms / 1000) % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}${format === 'srt' ? ',' : '.'}${pad(ms % 1000, 3)}`;
}

export function exportSubtitles(cues: Cue[], format: 'srt' | 'vtt'): string {
  if (format !== 'srt' && format !== 'vtt') throw new Error('Choose SRT or VTT.');
  const checked = validateCues(cues);
  const body = checked.map(cue => `${format === 'srt' ? `${cue.index}\n` : ''}${formatTime(cue.startMs, format)} --> ${formatTime(cue.endMs, format)}\n${cue.text}`).join('\n\n');
  return `${format === 'vtt' ? 'WEBVTT\n\n' : ''}${body}\n`;
}

export function auditCues(cues: Cue[], glossary: Record<string, string> = {}): Issue[] {
  const checked = validateCues(cues), terms = validateGlossary(glossary);
  const issues: Issue[] = [], seen = new Set<string>();
  const add = (cueId: string, kind: Issue['kind'], severity: Issue['severity'], message: string) => {
    const key = `${cueId}:${kind}`;
    if (!seen.has(key)) { issues.push({ cueId, kind, severity, message }); seen.add(key); }
  };
  let coverageEnd = -1, covering: Cue | undefined;
  for (const cue of [...checked].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)) {
    if (cue.startMs < coverageEnd && covering) {
      add(cue.id, 'overlap', 'warning', `Overlaps ${covering.id}; simultaneous speakers may be intentional. Check against the media.`);
      add(covering.id, 'overlap', 'warning', `Overlaps ${cue.id}; check whether simultaneous captions are intended.`);
    } else if (coverageEnd >= 0 && cue.startMs - coverageEnd > 2000) {
      add(cue.id, 'gap', 'info', `There is a ${(cue.startMs - coverageEnd) / 1000}s uncovered gap before this cue. It may be silence; audio has not been checked.`);
    }
    if (cue.endMs > coverageEnd) { coverageEnd = cue.endMs; covering = cue; }
    const plain = cue.text.replace(/<[^>]*>/g, '');
    const rate = [...plain.replace(/\s/g, '')].length / ((cue.endMs - cue.startMs) / 1000);
    if (rate > 20) add(cue.id, 'too-fast', 'warning', `About ${rate.toFixed(1)} visible characters/s exceeds the 20-character heuristic. Reading pace depends on language and audience.`);
    if (plain.split('\n').some(line => [...line].length > 42))
      add(cue.id, 'long-line', 'warning', 'A line exceeds the 42-character heuristic; review line breaks for the target display.');
    for (const [source, preferred] of Object.entries(terms)) {
      const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = /^[\w -]+$/.test(source) ? `\\b${escaped}\\b` : escaped;
      if (new RegExp(pattern, 'iu').test(plain) && !plain.includes(preferred))
        add(cue.id, 'terminology', 'info', `The user glossary suggests “${preferred}” for “${source}”. Confirm that the term is intended here.`);
    }
  }
  return issues;
}
