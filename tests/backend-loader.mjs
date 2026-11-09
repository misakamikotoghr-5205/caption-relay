import ts from 'typescript';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function loadBackend() {
  const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const temp = await mkdtemp(path.join(os.tmpdir(), 'caption-relay-tests-'));
  await writeFile(path.join(temp, 'package.json'), '{"type":"module"}');
  for (const file of ['lib/captions.ts', 'lib/agent.ts', 'lib/handoff.ts', 'app/api/review/route.ts']) {
    const source = await readFile(path.join(project, file), 'utf8');
    const js = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
      fileName: file,
    }).outputText.replace(/from (['"])(\.{1,2}\/[^'"]+)\1/g,
      (all, quote, specifier) => /\.[cm]?js$/.test(specifier) ? all : `from ${quote}${specifier}.js${quote}`);
    const output = path.join(temp, file.replace(/\.ts$/, '.js'));
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, js);
  }
  return {
    captions: await import(pathToFileURL(path.join(temp, 'lib/captions.js')).href),
    agent: await import(pathToFileURL(path.join(temp, 'lib/agent.js')).href),
    handoff: await import(pathToFileURL(path.join(temp, 'lib/handoff.js')).href),
    route: await import(pathToFileURL(path.join(temp, 'app/api/review/route.js')).href),
    cleanup: () => rm(temp, { recursive: true, force: true }),
  };
}
