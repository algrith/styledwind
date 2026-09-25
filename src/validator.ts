import { readFile, access } from 'fs/promises';
import { compile } from 'tailwindcss';
import path from 'path';

// Common locations across App Router / Pages Router / non-Next setups.
// Checked in order; first one that exists wins. A consumer with an
// unconventional path should pass `entryCss` explicitly to
// withStyledwindGuard(), which sets STYLEDWIND_ENTRY_CSS.
const CANDIDATE_ENTRY_PATHS = [
  'src/styles/globals.css',
  'src/app/globals.css',
  'styles/globals.css',
  'app/globals.css'
];

const resolveEntryCssPath = async (): Promise<string> => {
  const explicit = process.env.STYLEDWIND_ENTRY_CSS;
  if (explicit) return path.resolve(process.cwd(), explicit);

  for (const candidate of CANDIDATE_ENTRY_PATHS) {
    const full = path.join(process.cwd(), candidate);
    try {
      await access(full);
      return full;
    } catch {
      continue;
    }
  }

  throw new Error(
    'styledwind: could not find a Tailwind entry CSS file automatically. ' +
      `Checked: ${CANDIDATE_ENTRY_PATHS.join(', ')}. ` +
      'Pass { entryCss: "path/to/your.css" } to withStyledwindGuard() in next.config.ts.'
  );
};

const loadStylesheet = async (id: string, base: string) => {
  let filePath: string;

  if (id === 'tailwindcss' || id.startsWith('tailwindcss/')) {
    const pkgJsonPath = require.resolve('tailwindcss/package.json');
    const pkgRoot = path.dirname(pkgJsonPath);
    filePath =
      id === 'tailwindcss'
        ? path.join(pkgRoot, 'index.css')
        : path.join(pkgRoot, id.replace('tailwindcss/', ''));
  } else {
    filePath = path.resolve(base, id);
  }

  const content = await readFile(filePath, 'utf-8');
  return { path: filePath, base: path.dirname(filePath), content };
};

let compilerPromise: Promise<Awaited<ReturnType<typeof compile>>> | null = null;

const getCompiler = async () => {
  if (!compilerPromise) {
    const entryPath = await resolveEntryCssPath();
    const entryCss = await readFile(entryPath, 'utf-8');
    compilerPromise = compile(entryCss, { loadStylesheet });
  }
  return compilerPromise;
};

// Diffed against a running total rather than a fixed baseline. Tailwind
// v4's compiler is built around incremental, cached builds across calls,
// so a fixed baseline computed once goes stale the moment any class has
// ever been confirmed valid — every later check would then read as
// "longer than baseline" regardless of whether the current class itself
// contributed anything. Tracking the running set + its exact output
// length isolates precisely what each new class adds.
const knownValid: string[] = [];
let runningLength: number | null = null;

export const isValidTailwindClass = async (className: string): Promise<boolean> => {
  if (knownValid.includes(className)) return true;

  const compiler = await getCompiler();

  if (runningLength === null) {
    runningLength = compiler.build(knownValid).length;
  }

  const after = compiler.build([...knownValid, className]).length;
  const valid = after > runningLength;

  if (valid) {
    knownValid.push(className);
    runningLength = after;
  }

  return valid;
};
