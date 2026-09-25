// Shared between watcher.ts (server side) and overlay.tsx (client side) so
// there's exactly one default to keep in sync, instead of separate env
// vars/props that could silently drift apart if only one is updated.
export const DEFAULT_GUARD_PORT = 47821;
