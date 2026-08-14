/// <reference types="node" />

import type {Buffer} from 'node:buffer';
import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as process from 'node:process';

const ignore = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.cache',
  'coverage',
  '__pycache__',
  '.next',
  'out',
  '.nuxt',
  '.output',
  'target',
  'vendor',
]);

const colours = {
  reset: '\x1B[0m',
  bold: '\x1B[1m',
  dim: '\x1B[2m',
  cyan: '\x1B[36m',
  blue: '\x1B[34m',
  green: '\x1B[32m',
  yellow: '\x1B[33m',
  magenta: '\x1B[35m',
  red: '\x1B[31m',
  white: '\x1B[37m',
  orange: '\x1B[38;5;208m',
} as const;

const extensionColours: Record<string, string> = {
  '.ts': colours.blue,
  '.tsx': colours.blue,
  '.js': colours.yellow,
  '.jsx': colours.yellow,
  '.mjs': colours.yellow,
  '.cjs': colours.yellow,
  '.vue': colours.green,
  '.html': colours.orange,
  '.css': colours.magenta,
  '.scss': colours.magenta,
  '.less': colours.magenta,
  '.json': colours.cyan,
  '.md': colours.white,
  '.yml': colours.cyan,
  '.yaml': colours.cyan,
  '.sh': colours.green,
  '.py': colours.blue,
  '.rb': colours.red,
  '.rs': colours.red,
  '.go': colours.cyan,
  '.java': colours.red,
  '.kt': colours.magenta,
  '.swift': colours.orange,
  '.zig': colours.yellow,
  '.c': colours.blue,
  '.cpp': colours.blue,
  '.h': colours.blue,
  '.hpp': colours.blue,
  '.toml': colours.cyan,
  '.lock': colours.dim,
};

function isBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 512);
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) {
      return true;
    }
  }
  return false;
}

function colouriseExtension(ext: string): string {
  const colour = extensionColours[ext] ?? colours.white;
  const display = ext || '(none)';
  return `${colour}${display.padEnd(6)}${colours.reset}`;
}

async function walkDirectory(
  dir: string,
  onFile: (filePath: string, relativePath: string, ext: string) => Promise<void>,
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    console.error(`${colours.red}${dir}:${colours.reset}`, (error as Error).message);
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignore.has(entry.name)) {
        continue;
      }
      await walkDirectory(fullPath, onFile);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      const relativePath = path.relative(process.cwd(), fullPath);
      try {
        await onFile(fullPath, relativePath, ext);
      } catch (error) {
        console.error(`${relativePath}:${colours.reset}`, (error as Error).message);
      }
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const targetDir = args[0] ?? 'src';
  const absoluteSrc = path.resolve(process.cwd(), targetDir);
  const relativeSrc = path.relative(process.cwd(), absoluteSrc) || '.';

  console.log();
  console.log(`${colours.bold}${colours.cyan}╭─ Line Count${colours.reset}`);
  console.log(
    `${colours.cyan}│${colours.reset} ${colours.dim}Scanning${colours.reset} ${colours.bold}${relativeSrc}${colours.reset}`,
  );
  console.log(`${colours.cyan}│${colours.reset}`);

  let totalLines = 0;
  let totalFiles = 0;

  await walkDirectory(absoluteSrc, async (filePath, relativePath, ext) => {
    let buffer: Buffer;
    try {
      buffer = await readFile(filePath);
    } catch {
      return;
    }

    if (isBinary(buffer)) {
      return;
    }

    const content = buffer.toString('utf8');
    const lines = content.split(/\r?\n/).length;

    console.log(
      `${colours.cyan}│${colours.reset}  ${colouriseExtension(ext)} ` +
        `${relativePath} ${colours.dim}·${colours.reset} ${colours.bold}${lines.toLocaleString()}${colours.reset}`,
    );

    totalLines += lines;
    totalFiles++;
  });

  console.log(`${colours.cyan}│${colours.reset}`);
  console.log(`${colours.cyan}├─ ${colours.bold}Summary${colours.reset}`);
  console.log(
    `${colours.cyan}│${colours.reset}  ${colours.dim}Files${colours.reset}  ` +
      `${colours.bold}${totalFiles.toLocaleString()}${colours.reset}`,
  );
  console.log(
    `${colours.cyan}│${colours.reset}  ${colours.dim}Lines${colours.reset}  ` +
      `${colours.bold}${colours.green}${totalLines.toLocaleString()}${colours.reset}`,
  );
  console.log(`${colours.cyan}╰─${colours.reset}`);
  console.log();
}

main().catch((error) => {
  console.error(`${colours.reset}`, error);
  process.exit(1);
});
