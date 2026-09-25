'use client';

import { CSSProperties, useEffect, useState } from 'react';
import { DEFAULT_GUARD_PORT } from './constants';

type GuardError = { file: string; className: string };
type GuardState = { type: 'error'; errors: GuardError[] } | { type: 'resolved' };

export interface StyledwindGuardOverlayProps {
  /** Must match the `port` passed to withStyledwindGuard() in next.config.ts. */
  port?: number;
}

export const StyledwindGuardOverlay = ({ port = DEFAULT_GUARD_PORT }: StyledwindGuardOverlayProps) => {
  const [state, setState] = useState<GuardState>({ type: 'resolved' });
  const style = {
    background: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    flexDirection: 'column',
    fontFamily: 'monospace',
    alignItems: 'center',
    position: 'fixed',
    display: 'flex',
    padding: '2rem',
    zIndex: 999999,
    color: '#fff',
    inset: 0
  } satisfies CSSProperties;

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    let socket: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      socket = new WebSocket(`ws://localhost:${port}`);

      socket.onmessage = (event) => {
        try {
          setState(JSON.parse(event.data));
        } catch {
          // ignore malformed payloads
        }
      };

      // The watcher process may not be up yet on first app boot, or may
      // restart independently of the Next.js dev server — retry quietly
      // instead of surfacing a connection error to the user.
      socket.onclose = () => {
        reconnectTimer = setTimeout(connect, 2000);
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [port]);

  if (process.env.NODE_ENV !== 'development' || state.type !== 'error') return null;

  return (
    <div style={style}>
      <div style={{ maxWidth: 640, width: '100%' }}>
        <h1 style={{ color: '#f87171', fontSize: '1.25rem', marginBottom: '1rem' }}>
          🚩 Invalid Tailwind class{state.errors.length > 1 ? 'es' : ''} found
        </h1>

        {state.errors.map(({ file, className }) => (
          <div key={file} style={{ marginBottom: '0.75rem' }}>
            <div style={{ opacity: 0.7 }}>{file}</div>
            <div style={{ color: '#facc15' }}>"{className}"</div>
          </div>
        ))}
        
        <p style={{ opacity: 0.6, marginTop: '1.5rem', fontSize: '0.875rem' }}>
          Fix the class name and save — this will close automatically.
        </p>
      </div>
    </div>
  );
};
