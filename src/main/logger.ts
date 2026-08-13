/* eslint-disable no-console */
import { is } from '@electron-toolkit/utils';

const reset = '\x1B[0m';
const dim = '\x1B[2m';
const cyan = '\x1B[36m';
const green = '\x1B[32m';
const yellow = '\x1B[33m';
const red = '\x1B[31m';
const magenta = '\x1B[35m';
const blue = '\x1B[34m';

function timestamp(): string {
  return `${dim + new Date().toISOString().slice(11, 23) + reset} `;
}

function noop(): void {}

export const dbg = is.dev
  ? {
      cache: (message: string) =>
        console.log(`${timestamp() + cyan}[CACHE] ${reset}${message}`),
      dedup: (message: string) =>
        console.log(`${timestamp() + magenta}[DEDUP] ${reset}${message}`),
      sem: (message: string) =>
        console.log(`${timestamp() + blue}[SEM]   ${reset}${message}`),
      http: (message: string) =>
        console.log(`${timestamp() + green}[HTTP]  ${reset}${message}`),
      retry: (message: string) =>
        console.log(`${timestamp() + yellow}[RETRY] ${reset}${message}`),
      ipc: (message: string) =>
        console.log(`${timestamp() + yellow}[IPC]   ${reset}${message}`),
      error: (message: string) =>
        console.log(`${timestamp() + red}[ERROR] ${reset}${message}`),
      rpc: (message: string) =>
        console.log(`${timestamp() + blue}[RPC]   ${reset}${message}`),
    }
  : {
      cache: noop,
      dedup: noop,
      sem: noop,
      http: noop,
      retry: noop,
      ipc: noop,
      error: noop,
      rpc: noop,
    };
