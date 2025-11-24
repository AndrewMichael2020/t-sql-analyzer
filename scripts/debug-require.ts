import path from 'path';
import fs from 'fs';

function tryRequire(p: string) {
  const cwd = process.cwd();
  const tries = [p, p + '.ts', p + '.js'];
  const resolvedCandidates = tries.map(t => path.resolve(cwd, t));
  const exists = resolvedCandidates.map(p => ({ p, exists: fs.existsSync(p) }));
  console.log(`Trying to require ${p}. Candidates:`, exists);

  for (const candidate of resolvedCandidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(candidate);
      console.log(`OK: required ${candidate} ->`, Object.keys(mod));
      return;
    } catch (e) {
      const err = e as any;
      const msg = err && typeof err === 'object' && 'message' in err ? err.message : String(err);
      console.error(`ERROR requiring ${candidate}:`, msg);
    }
  }
}

console.log('cwd:', process.cwd());
tryRequire('src/server/identifyStages');
tryRequire('src/server/generateMermaid');
tryRequire('src/server/utils/canonicalize');

// Also test imports with explicit .ts extensions
tryRequire('src/server/identifyStages.ts');
tryRequire('src/server/generateMermaid.ts');
tryRequire('src/server/utils/canonicalize.ts');

console.log('Done');
