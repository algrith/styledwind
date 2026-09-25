import { isValidTailwindClass } from './validator';
import { execSync } from 'child_process';
import { WebSocket, Server } from 'ws';
import { FSWatcher } from 'chokidar';
import fs from 'fs';

const fileErrors = new Map<string, string>();
let queue: Promise<void> = Promise.resolve();
const seenValidClasses = new Set<string>();
const TW_TAG_REGEX = /\btw`([^`]*)`/g;
export const appRoot = process.cwd();

export const freeStalePort = (port: number) => {
  if (process.platform === 'win32') {
    try {
      const output = execSync(`netstat -ano | findstr :${port}`).toString();
      
      const pids = new Set(
        output.split('\n').map((line) => line.trim().split(/\s+/).pop()).filter((pid): pid is string => Boolean(pid))
      );

      pids.forEach((pid) => {
        try {
          execSync(`taskkill /PID ${pid} /F`);
        } catch {
          // process already gone — fine
        }
      });
    } catch {
      // findstr exits non-zero when nothing matches — nothing to free
    }

    return;
  }

  try {
    const pids = execSync(`lsof -ti:${port}`).toString().trim().split('\n').filter(Boolean);
    pids.forEach((pid) => {
      try {
        process.kill(Number(pid), 'SIGKILL');
      } catch (e) {
        // already gone by the time we got here — fine
      }
    });
  } catch (e) {
    // lsof exits non-zero when nothing is listening on the port — expected
    // in the normal case, not an actual error
  }
};

export class Logger {
  logSocketError = (error: NodeJS.ErrnoException, port: number) => {
    if (error.code !== 'EADDRINUSE') {
      console.error('styledwind: WebSocket server error:', error);
    } else {
      const nodeCommand = `npx kill-port ${port}`;
      
      const command = (() => {
        switch (process.platform) {
          case 'darwin':
            return `${nodeCommand} (or: lsof -ti:${port} | xargs kill -9)\n`;
          case 'win32':
            return `${nodeCommand}\n`;
          default:
            return nodeCommand;
        }
      })();
      
      console.error(
        `styledwind: port ${port} is already in use.\n` +
          `To free the port:\n` +
          `  ${command}\n` +
          `Or set a custom port: withStyledwindGuard({ port: 47822 })
        `
      );
    }

    process.exit(1);
  };

  logError = (file: string, cls: string) => {
    console.warn(`\n🚩 Invalid Tailwind class found:\n   -> ${file.replace(appRoot, '')}\n      "${cls}"\n`);
  };

  logSuccess = () => {
    console.log('\n✅ All Tailwind classes valid.\n');
  };
};

export class Scanner extends Logger {
  private clients: Set<WebSocket>;

  constructor(clients: Set<WebSocket>) {
    super();
    this.clients = clients;
  }
  
  isWatchableFileType = (filePath: string) => filePath.endsWith('.ts') || filePath.endsWith('.tsx');

  shutdown = (watcher: FSWatcher, wss: Server) => {
    watcher.close();
  
    for (const client of this.clients) {
      client.terminate();
    }
    
    const forceExitTimer = setTimeout(() => process.exit(0), 1000).unref();
  
    wss.close(() => {
      clearTimeout(forceExitTimer);
      process.exit(0);
    });
  };
  
  scanFile = async (filePath: string) => {
    if (!this.isWatchableFileType(filePath)) return;

    const content = fs.readFileSync(filePath, 'utf-8');
    let foundInvalid: string | null = null;

    scan: for (const match of content.matchAll(TW_TAG_REGEX)) {
      const body = match[1];
      if (body.includes('${')) continue; // dynamic interpolation — no static string to check

      for (const cls of body.split(/\s+/).filter(Boolean)) {
        if (seenValidClasses.has(cls)) continue;

        if (await isValidTailwindClass(cls)) {
          seenValidClasses.add(cls);
        } else {
          foundInvalid = cls;
          break scan;
        }
      }
    }

    const hadErrorBefore = fileErrors.size > 0;

    if (foundInvalid) {
      fileErrors.set(filePath, foundInvalid);
      this.logError(filePath, foundInvalid);
    } else {
      fileErrors.delete(filePath);
      if (hadErrorBefore && fileErrors.size === 0) this.logSuccess();
    }

    this.broadcastStateToClientApp();
  };
  
  enqueueScan = (filePath: string) => {
    queue = queue.then(() => this.scanFile(filePath));
    return queue;
  };
  
  broadcastStateToClientApp = () => {
    const payload = JSON.stringify(this.currentState());

    for (const client of this.clients) {
      if (client.readyState === client.OPEN) client.send(payload);
    }
  };

  currentState = () => {
    if (fileErrors.size === 0) return { type: 'resolved' as const };
    
    return {
      type: 'error' as const,
      errors: Array.from(fileErrors, ([file, className]) => ({
        file: file.replace(appRoot, ''),
        className,
      })),
    };
  };
};