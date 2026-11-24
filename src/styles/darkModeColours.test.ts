import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * In dark mode the pale `bg-{hue}-50` fills are remapped to translucent tints (src/index.css), so any dark text shade used on them has
 * to be remapped to a pale one as well — otherwise a banner reads dark on dark. This stops a new banner from slipping through.
 */
const ROOT = join(__dirname, '..');
const css = readFileSync(join(ROOT, 'index.css'), 'utf8');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}
const code = sources(ROOT).map((p) => readFileSync(p, 'utf8')).join('\n');
const used = (re: RegExp) => [...new Set(code.match(re) ?? [])].sort();

describe('dark mode colours', () => {
  const darkText = used(/\btext-(?:blue|amber|red|emerald|green|purple|cyan|indigo|brand|orange|yellow)-(?:800|900)\b/g);

  it('finds the dark text shades the app uses (so this test is not vacuous)', () => {
    expect(darkText).toEqual(expect.arrayContaining(['text-blue-900', 'text-amber-800']));
  });

  it.each(darkText)('has a dark-mode colour for %s', (utility) => {
    expect(css).toMatch(new RegExp(`\\.dark \\.${utility}\\b[^{]*\\{`));
  });

  const translucentFills = used(/\bbg-(?:blue|amber|red|emerald|green|purple|cyan|indigo|brand|orange|yellow)-50\/\d+\b/g);

  it.each(translucentFills)('has a dark-mode fill for %s', (utility) => {
    const escaped = utility.replace('/', '\\/');
    expect(css).toContain(`.dark .${escaped}`);
  });
});
