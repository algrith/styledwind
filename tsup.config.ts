import { defineConfig } from 'tsup';

const outExtension = ({ format }: { format: string }) => ({
  js: format === 'esm' ? '.mjs' : '.cjs',
});

export default defineConfig([
  // Client-safe entries
  {
    entry: { styled: 'src/styled.tsx' },
    format: ['esm', 'cjs'],
    external: ['react'],
    outExtension,
    clean: true,
    dts: true
  },
  {
    entry: { overlay: 'src/overlay.tsx' },
    banner: { js: "'use client';" },
    format: ['esm', 'cjs'],
    external: ['react'],
    outExtension,
    dts: true
  },
  // Node-only entries. withStyledwindGuard.ts resolves watcher.js relative
  // to its own compiled location via import.meta.url, so keep both in the
  // same build step / output directory. shims: true keeps import.meta.url
  // working correctly in the CJS build too, not just ESM.
  {
    entry: { withStyledwindGuard: 'src/withStyledwindGuard.ts', watcher: 'src/watcher.ts' },
    format: ['esm', 'cjs'],
    platform: 'node',
    outExtension,
    shims: true,
    dts: true
  }
]);