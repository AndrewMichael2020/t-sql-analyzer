const path = require('path');
const fs = require('fs');

function tryRequire(p) {
  const cwd = process.cwd();
  const candidates = [p, `${p}.ts`, `${p}.js`].map(t => ({ p: path.resolve(cwd, t), exists: fs.existsSync(path.resolve(cwd, t)) }));
  console.log(`Trying to require ${p}. Candidates:`, candidates);
  for (const c of candidates) {
    try {
      const mod = require(c.p);
      console.log(`OK: required ${c.p} ->`, Object.keys(mod));
      return;
    } catch (e) {
      console.error(`ERROR requiring ${c.p}:`, e && e.message || e);
    }
  }
}

console.log('cwd:', process.cwd());
tryRequire('src/server/identifyStages');
tryRequire('src/server/generateMermaid');
tryRequire('src/server/utils/canonicalize');
tryRequire('src/server/identifyStages.ts');
tryRequire('src/server/generateMermaid.ts');
tryRequire('src/server/utils/canonicalize.ts');
console.log('Done');
