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

const hashCommentExts = new Set([
  '.py',
  '.rb',
  '.r',
  '.R',
  '.jl',
  '.ex',
  '.exs',
  '.erl',
  '.hrl',
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.pl',
  '.pm',
  '.php',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.cfg',
  '.conf',
  '.gitignore',
  '.dockerignore',
  '.make',
  '.mk',
  '.cmake',
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
};

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
    if (sample[i] === 0) 
return true;
  }
  return false;
}

function colouriseExtension(ext: string): string {
  const colour = extensionColours[ext] ?? colours.white;
  const display = ext || '(none)';
  return `${colour}${display.padEnd(6)}${colours.reset}`;
}

interface CommentBlock {
  type: 'single' | 'multi';
  startLine: number;
  endLine: number;
  text: string;
}

function extractComments(content: string, ext: string): CommentBlock[] {
  const comments: CommentBlock[] = [];
  let state = 'normal';
  let i = 0;
  const len = content.length;
  let line = 1;
  let commentStartLine = 0;
  let commentStart = 0;
  const allowHash = hashCommentExts.has(ext);

  while (i < len) {
    const ch = content[i];
    const next = i + 1 < len ? content[i + 1] : '';

    if (ch === '\n') {
      if (state === 'single_line_comment') {
        const text = content.slice(commentStart, i).trimEnd();
        comments.push({
          type: 'single',
          startLine: commentStartLine,
          endLine: line,
          text,
        });
        state = 'normal';
      }
      line++;
      i++;
      continue;
    }

    switch (state) {
      case 'normal':
        if (ch === '/' && next === '/') {
          state = 'single_line_comment';
          commentStartLine = line;
          commentStart = i + 2;
          i += 2;
          continue;
        }
        if (ch === '/' && next === '*') {
          state = 'multi_line_comment';
          commentStartLine = line;
          commentStart = i + 2;
          i += 2;
          continue;
        }
        if (allowHash && ch === '#') {
          if (line === 1 && next === '!') {
            i++;
            continue;
          }
          state = 'single_line_comment';
          commentStartLine = line;
          commentStart = i + 1;
          i += 1;
          continue;
        }
        if (ch === "'") {
          state = 'single_string';
          i++;
          continue;
        }
        if (ch === '"') {
          state = 'double_string';
          i++;
          continue;
        }
        if (ch === '`') {
          state = 'template';
          i++;
          continue;
        }
        i++;
        break;

      case 'single_string':
        if (ch === '\\' && next) {
          i += 2;
          continue;
        }
        if (ch === "'") 
state = 'normal';
        i++;
        break;

      case 'double_string':
        if (ch === '\\' && next) {
          i += 2;
          continue;
        }
        if (ch === '"') 
state = 'normal';
        i++;
        break;

      case 'template':
        if (ch === '\\' && next) {
          i += 2;
          continue;
        }
        if (ch === '`') 
state = 'normal';
        i++;
        break;

      case 'single_line_comment':
        i++;
        break;

      case 'multi_line_comment':
        if (ch === '*' && next === '/') {
          const text = content.slice(commentStart, i).trim();
          comments.push({
            type: 'multi',
            startLine: commentStartLine,
            endLine: line,
            text,
          });
          state = 'normal';
          i += 2;
        } else {
          i++;
        }
        break;
    }
  }

  if (state === 'single_line_comment') {
    const text = content.slice(commentStart).trimEnd();
    comments.push({ type: 'single', startLine: commentStartLine, endLine: line, text });
  } else if (state === 'multi_line_comment') {
    const text = content.slice(commentStart).trim();
    comments.push({ type: 'multi', startLine: commentStartLine, endLine: line, text });
  }

  return comments;
}

async function walkDirectory(
  dir: string,
  onFile: (filePath: string, relativePath: string, ext: string) => Promise<void>,
) {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(`${colours.red}${dir}:${colours.reset}`, error.message);
    } else {
      console.error(`${colours.red}${dir}:${colours.reset}`, String(error));
    }
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignore.has(entry.name)) 
continue;
      await walkDirectory(fullPath, onFile);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      const relativePath = path.relative(process.cwd(), fullPath);
      try {
        await onFile(fullPath, relativePath, ext);
      } catch (error: unknown) {
        if (error instanceof Error) {
          console.error(`${relativePath}:`, error.message);
        } else {
          console.error(`${relativePath}:`, String(error));
        }
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
  console.log(`${colours.bold}${colours.cyan}╭─ Comment Scan${colours.reset}`);
  console.log(
    `${colours.cyan}│${colours.reset} ${colours.dim}Scanning${colours.reset} ${colours.bold}${relativeSrc}${colours.reset}`,
  );
  console.log(`${colours.cyan}│${colours.reset}`);

  let totalFiles = 0;
  let totalCommentBlocks = 0;
  let totalCommentLines = 0;

  await walkDirectory(
    absoluteSrc,
    async (filePath: string, relativePath: string, ext: string) => {
      let buffer: Buffer;
      try {
        buffer = await readFile(filePath);
      } catch {
        return;
      }
      if (isBinary(buffer)) 
return;

      const content = buffer.toString('utf8');
      const comments = extractComments(content, ext);

      if (comments.length === 0) 
return;

      console.log(
        `${colours.cyan}│${colours.reset}  ${colouriseExtension(ext)} ${relativePath}`,
      );

      let fileCommentLines = 0;
      for (const c of comments) {
        const lineSpan = c.endLine - c.startLine + 1;
        fileCommentLines += lineSpan;
        const typeLabel = c.type === 'single' ? '//' : '/* */';
        const lineInfo =
          c.type === 'single'
            ? `line ${c.startLine}`
            : `lines ${c.startLine}-${c.endLine}`;
        const preview = c.text.length > 50 ? `${c.text.slice(0, 47)}...` : c.text;
        console.log(
          `${colours.cyan}│${colours.reset}    ${colours.dim}${typeLabel}${colours.reset} ` +
            `${colours.dim}${lineInfo}${colours.reset}  ${preview}`,
        );
      }

      totalFiles++;
      totalCommentBlocks += comments.length;
      totalCommentLines += fileCommentLines;
    },
  );

  console.log(`${colours.cyan}│${colours.reset}`);
  console.log(`${colours.cyan}├─ ${colours.bold}Summary${colours.reset}`);
  console.log(
    `${colours.cyan}│${colours.reset}  ${colours.dim}Files with comments${colours.reset}  ` +
      `${colours.bold}${totalFiles.toLocaleString()}${colours.reset}`,
  );
  console.log(
    `${colours.cyan}│${colours.reset}  ${colours.dim}Comment blocks${colours.reset}       ` +
      `${colours.bold}${totalCommentBlocks.toLocaleString()}${colours.reset}`,
  );
  console.log(
    `${colours.cyan}│${colours.reset}  ${colours.dim}Total comment lines${colours.reset}   ` +
      `${colours.bold}${colours.green}${totalCommentLines.toLocaleString()}${colours.reset}`,
  );
  console.log(`${colours.cyan}╰─${colours.reset}`);
  console.log();
}

main().catch((error) => {
  console.error(colours.reset, error);
  process.exit(1);
});
