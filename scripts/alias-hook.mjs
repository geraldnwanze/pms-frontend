import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
const SRC = process.cwd() + '/src/';
function tryExt(base) {
  for (const c of [base, base + '.ts', base + '.tsx', base + '/index.ts']) {
    if (existsSync(c)) return pathToFileURL(c).href;
  }
  return null;
}
export async function resolve(specifier, context, nextResolve) {
  let target = null;
  if (specifier.startsWith('@/')) {
    target = tryExt(SRC + specifier.slice(2));
  } else if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL) {
    const resolved = new URL(specifier, context.parentURL);
    if (resolved.protocol === 'file:') target = tryExt(decodeURIComponent(resolved.pathname));
  }
  if (target) return { url: target, shortCircuit: true };
  return nextResolve(specifier, context);
}
