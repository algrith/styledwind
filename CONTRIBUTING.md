# Contributing to @algrith/styledwind

Thanks for taking the time to contribute! This guide covers local setup,
the project layout, and how to test changes against a real app — Next.js
or otherwise — before opening a pull request.

## Local setup

```bash
git clone https://github.com/algrith/styledwind.git
cd styledwind
npm install
npm run build
```

`npm run build` runs `tsup` and produces the `dist/` folder — this is what
gets published and what consuming apps actually import, so any change to
`src/` needs a rebuild before it's visible elsewhere.

## Project layout

```
src/
├── styled.tsx             # styled() / tw() / variants() — the core CSS-in-JS util
├── constants.ts           # shared defaults (e.g. DEFAULT_GUARD_PORT)
├── validator.ts           # Node-only — validates classes via Tailwind v4's compile() API
├── watcher.ts             # Node-only — file watcher + WebSocket server
├── utils.ts               # Node-only — Logger/Scanner helpers, stale-port cleanup
├── withStyledwindGuard.ts # Next.js config wrapper — spawns the watcher in dev
└── overlay.tsx            # 'use client' — the invalid-class overlay component
```

`validator.ts`, `watcher.ts`, `utils.ts`, and `withStyledwindGuard.ts` are
**Node-only**. They use `fs`, `child_process`, and Tailwind's Node compiler
APIs, and must never be imported from `styled.tsx` or `overlay.tsx` — doing
so would break or bloat the client bundle for anyone using this package.

## Testing changes against a real app

The fastest way to verify a change end-to-end is linking it locally into a
real consuming app — Next.js or a plain React app (Vite/CRA):

```bash
# in this repo
npm run build
npm link

# in a test app
npm link @algrith/styledwind
```

When testing the standalone (non-Next.js) watcher path specifically, also
link the CLI binary so `styledwind-watch` resolves to your local build:

```bash
npm link @algrith/styledwind
npx styledwind-watch
```

Restart `next dev` in the test app after linking (module resolution is
cached per dev-server process), and re-run `npm run build` here after every
change — the linked app picks it up automatically through the symlink.

If you'd rather test against a real, non-symlinked install (closer to what
a real `npm install` produces):

```bash
npm run build
npm pack
# then, in the test app:
npm install /absolute/path/to/algrith-styledwind-<version>.tgz
```

## Submitting a change

1. Open an issue first for anything beyond a small fix, so the approach
   can be discussed before you invest time in it.
2. Keep pull requests focused — one fix or feature per PR.
3. Update `README.md` if the change affects any public API or usage
   pattern.
4. Confirm `npm run build` completes with no TypeScript errors before
   opening the PR.

## Reporting bugs

Please include:

- Your Next.js and Tailwind CSS versions
- The exact `styled\`...\`` template that produced the issue
- Whether the issue occurs in the styling API, the validator, or the
  overlay — this repo's Node-only and client-only code are tested quite
  differently, so knowing which half is affected speeds up triage
