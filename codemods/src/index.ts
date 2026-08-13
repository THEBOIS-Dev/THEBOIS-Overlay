/* eslint-disable no-console */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(process.cwd(), '../src');
const canonicalRegex = /(text|bg|border|ring|stroke|fill)-\[\s*var\(--([^)]+)\)\s*\]/g;

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (['.vue', '.ts', '.tsx', '.js', '.jsx', '.html'].includes(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

async function main() {
  const files = await collectFiles(root);

  for (const file of files) {
    let source = await fs.readFile(file, 'utf8');
    let hasChanged = false;

    source = source.replaceAll(canonicalRegex, (_, prefix: string, token: string) => {
      hasChanged = true;
      const normalized = token
        .replace(/^color-/, '')
        .replace(/^spacing-/, '')
        .replace(/^radius-/, '');
      return `${prefix}-${normalized}`;
    });

    if (hasChanged) {
      await fs.writeFile(file, source);
      console.log(`${path.relative(process.cwd(), file)}`);
    }
  }

  console.log('Tailwind canonicalization complete.');
}

void main();
