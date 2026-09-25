import { freeStalePort, Scanner, appRoot } from './utils';
import { DEFAULT_GUARD_PORT } from './constants';
import { WebSocketServer, WebSocket } from 'ws';
import chokidar from 'chokidar';

const PORT = Number(process.env.STYLEDWIND_GUARD_PORT) || DEFAULT_GUARD_PORT;

freeStalePort(PORT);

const wss = new WebSocketServer({ port: PORT });
const clients = new Set<WebSocket>();
const scanner = new Scanner(clients);

// Web socket setup for error modal control.
wss.on('error', (error) => scanner.logSocketError(error, PORT));

wss.on('connection', (socket) => {
  socket.send(JSON.stringify(scanner.currentState()));
  socket.on('close', () => clients.delete(socket));
  clients.add(socket);
});

wss.on('listening', () => {
  console.log(`👀 styledwind: watching for invalid Tailwind classes (ws://localhost:${PORT})`);
});

// Watcher instantiation/event listener setup.
const watcher = chokidar.watch(appRoot, {
  ignoreInitial: false,
  persistent: true,
  ignored: [
    /(^|[/\\])\../,
    /node_modules/,
    /\.next/,
    /build/,
    /dist/
  ]
});

watcher.on('change', (filePath) => scanner.enqueueScan(filePath));
watcher.on('add', (filePath) => scanner.enqueueScan(filePath));

// Signal listener for watcher shutdown.
process.on('SIGTERM', () => scanner.shutdown(watcher, wss));
process.on('SIGINT', () => scanner.shutdown(watcher, wss));