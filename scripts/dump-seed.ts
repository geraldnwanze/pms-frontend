import { writeFileSync, mkdirSync } from 'node:fs';
import { generateSeed } from '../src/data/seed';

const data = generateSeed();
const outDir = new URL('../../../laravel/pms-backend/database/data/', import.meta.url);
try { mkdirSync(outDir, { recursive: true }); } catch {}
writeFileSync(new URL('seed-data.json', outDir), JSON.stringify(data));
const counts = Object.fromEntries(
  Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v.length : v]),
);
console.log('seed generated:', JSON.stringify(counts));
