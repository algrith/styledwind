import { DEFAULT_GUARD_PORT } from './constants';
import type { NextConfig } from 'next';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

export interface StyledwindGuardOptions {
  entryCss?: string;
  port?: number;
}

declare const __filename: string | undefined; // present only in the CJS build


const watcherExtension = typeof __filename !== 'undefined' ? '.cjs' : '.mjs';

export const withStyledwindGuard = (nextConfig: NextConfig = {}, options: StyledwindGuardOptions = {}): NextConfig => {
  if (process.env.NODE_ENV === 'development' && !process.env.STYLEDWIND_GUARD_SPAWNED) {
    process.env.STYLEDWIND_GUARD_SPAWNED = '1';
    
    if (options.entryCss) process.env.STYLEDWIND_ENTRY_CSS = options.entryCss;
    process.env.STYLEDWIND_GUARD_PORT = String(options.port ?? DEFAULT_GUARD_PORT);

    const watcherPath = path.join(getCurrentDir(), `watcher${watcherExtension}`);
    
    const watcher = spawn(process.execPath, [watcherPath], {
      stdio: 'inherit',
    });

    watcher.unref();
  }
  
  return nextConfig;
};

const getCurrentDir = () => {
  if (typeof __filename !== 'undefined') return path.dirname(__filename);
  return path.dirname(fileURLToPath(import.meta.url));
};