/* eslint-disable no-console */
import fg from 'fast-glob';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), '../src');

const files = await fg(
  ['**/*.vue', '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.html'],
  {
    cwd: ROOT,
    absolute: true,
  },
);

const canonicalRegex = /(text|bg|border|ring|stroke|fill)-\[\s*var\(--([^)]+)\)\s*\]/g;

for (const file of files) {
  let source = await fs.readFile(file, 'utf8');

  let changed = false;

  source = source.replaceAll(canonicalRegex, (_, prefix: string, token: string) => {
    changed = true;

    const normalized = token
      .replace(/^color-/, '')
      .replace(/^spacing-/, '')
      .replace(/^radius-/, '');

    return `${prefix}-${normalized}`;
  });

  if (changed) {
    await fs.writeFile(file, source);

    console.log(`${path.relative(process.cwd(), file)}`);
  }
}

console.log('Tailwind canonicalization complete.');
