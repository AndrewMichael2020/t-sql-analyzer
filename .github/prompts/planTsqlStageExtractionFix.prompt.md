Investigation and Fix Plan: t-sql-analyzer: T-SQL Rendering & Stage Extraction

Summary
-------
Goal:
- Investigate why the complex T-SQL script fails to render and provide a minimal, deterministic plan to fix: parse robustness, stage detection (CTE/temp/final SELECT), extraction of FROM/JOIN/WHERE/GROUP BY inside stage blocks, and generate Mermaid text that follows the "stage-only blocks" requirements.

Key Findings
------------
- The code relies on heuristics (e.g., cte_ prefix, exact string matches) that break on typical T-SQL.
- Parser errors happen on T-SQL constructs like `AT TIME ZONE`, nested `CAST`, `ROW_NUMBER() OVER`, `IIF`, or where the node-sql-parser produces AST shapes the code doesn’t fully support.
- SELECT INTO, INSERT INTO, and temp table detection is brittle, with inconsistent AST shapes causing some temp stages to be missed.
- The extractors fallback to placeholders like `[Complex Expression]` for many node types, reducing fidelity and sometimes causing downstream logic to fail.

Core Problems (Root Cause Summary)
----------------------------------
1) Stage detection uses prefix heuristics (e.g., `cte_`) and does not canonicalize identifier names; arbitrary CTE names are missed.
2) Name matching for dependencies lacking canonicalization causes missing arrows when casing/schemas/brackets differ.
3) Subqueries / derived tables aren’t traversed to detect dependencies that occur inside them.
4) SELECT INTO and INSERT shapes are inconsistently handled, leading to missed stage detection for temp tables.
5) Parser limitations or non-T-SQL AST node handling cause thrown parse errors; fallback or pre-sanitization needed.
6) Complex expressions often degrade to placeholders; rehydrating SQL for these nodes would improve fidelity.

Recommended Changes (High-level Plan)
-------------------------------------
1. Add a canonicalization helper used across identifyStages and generateMermaid:
   - Strip square brackets and quotes
   - Remove schema/db qualifiers
   - Lowercase (for matching only)
   - Respect `#` prefixes for temp tables

2. Improve dependency detection:
   - Build a set of known stage names (CTE/temp) while scanning statements.
   - Use canonicalized names and alias mapping to detect dependencies inside FROM/JOIN and nested subqueries.

3. Robust SELECT INTO / INSERT detection:
   - Handle multiple AST shapes (string, object with `.table` or `.expr`, with/without schema/brackets).

4. Expand extractors for expressions and condition SQL:
   - Rehydrate SQL for `case`, `cast`, `over` (window functions), `function`, nested expressions.
   - For unknown nodes, fallback to extracting raw SQL substring from original text rather than `[Complex Expression]`.

5. Parser fallback / preprocessor:
   - Add a sanitization fallback for tokens that commonly break the SQL parser (e.g., `AT TIME ZONE`).
   - Try parsing with TransactSQL and if failing, retry with sanitized SQL and still preserve original SQL for display.

6. Mermaid generation uses canonical name mapping for edges
   - Use canonical keys for internal mapping, but render original label text for display.

7. Add robust tests covering:
   - Arbitrarily-named CTE dependencies
   - SELECT INTO with nested subquery and window function
   - AT TIME ZONE in expressions
   - Derived-table dependencies referencing CTEs
   - INSERT INTO temp table detection

Implementation Plan (Concrete Steps)
-----------------------------------
1. `parseSql(sqlText)`
   - Add preprocessor fallback: if parser fails, sanitize problematic tokens and retry.
   - Return both AST and original SQL or sanitized notes.

2. `identifyStages(ast)`
   - First pass: collect stage names (CTE alias names, temp table names from `INTO`, `INSERT INTO`).
   - Build canonicalized name set and alias map for each stage.
   - Second pass: extract FROM/JOIN/WHERE/GROUP BY for each stage by recursively traversing the stage's AST, collecting table names and subqueries.
   - When collecting references, canonicalize and match against stage set to populate StageSpec.dependencies.

3. `extractSpec(stage)`
   - Return: { fromItems, joinItems, whereItems, groupByItems }
   - FROM: store text of table/subquery expression verbatim (escape quotes)
   - JOIN: store fulljoin text `JOIN: <JOIN_TYPE> <table> ON <condition SQL>`
   - WHERE: flatten via `AND`, preserve OR groups; return textual SQL for each predicate
   - GROUP BY: store each expression text verbatim

4. `generateMermaid(specs)`
   - Build subgraphs by stage type (CTE, TEMP, FINAL), add nodes in order FROM -> JOIN -> WHERE -> GROUP BY.
   - Use internal canonicalization for `nameToId` map and dependency match; always render one vertical arrow between dependent stages.

5. Tests & Verification
   - Add unit tests covering the failing scenarios and edge cases.
   - Run the pipeline against the user's sample SQL from the repo/issue and verify:
     - No parse errors
     - All 3 stages (SELECT INTO #final, SELECT INTO #final_transformed, final SELECT with joins) found
     - All FROM/JOIN/WHERE/GROUP BY entries exist *inside* stage blocks
     - Exactly one vertical arrow per dependency

Detailed Work Items
-------------------
- Add `src/server/utils/canonicalize.ts` with `canonicalizeIdentifier` and `extractSimpleTableIdentifier` functions.
- Update `src/server/parseSql.ts` to accept sanitization options and gracefully return the AST or errors with sanitization hints.
- Update `src/server/identifyStages.ts` to:
  - Use two-pass stage detection.
  - Walk nested AST nodes for derived subqueries.
  - Support multiple AST shapes for `INTO`/`INSERT`.
  - Use alias mapping for dependency detection.
- Update `src/server/extractDiagramSpec.ts` to rehydrate SQL from AST nodes for complex expressions.
- Update `src/server/generateMermaid.ts` to map canonical names to IDs and create stage-only subgraph outputs.
- Add tests under `src/server/__tests__` (or equivalent) to exercise common T-SQL constructs.

Testing & CI
------------
- Unit tests to assert StageSpec structure and mermaid output for each scenario.
- Add regression test with the problematic sample SQL to prevent recurrence.
- Make sure the `CICD` run ensures these tests pass.

Test environment stabilization & debugging
----------------------------------------
Problem found: The test runner failed to resolve TypeScript modules due to a mix of ESM/CJS runtime issues, ts-node/tsconfig-paths registration ordering, and inconsistent import styles across code and tests.

Immediate fixes to add to this plan:
1. Create `tsconfig.test.json` (CommonJS) for tests that extends `tsconfig.json` and forces `module: CommonJS` and `esModuleInterop: true`.
2. Standardize and lock the test runner script to one mode (CommonJS preferred):
   - Default `test`: `npm run test:cjs`
   - `test:cjs`: `uvu -r tsconfig-paths/register -r ts-node/register/transpile-only src/server/__tests__`
   - `test:esm` (optional): `node --loader ts-node/esm -r tsconfig-paths/register ./node_modules/uvu/bin.js src/server/__tests__`
3. Register `tsconfig-paths` before `ts-node` for path alias resolution in tests.
4. Revert ad-hoc dynamic `require`/`import` fallback code from server runtime — keep production imports consistent.
5. Adjust test imports to be predictable and CJS-friendly: tests should use `require()` with relative or project-root resolved paths. Prefer `path.resolve(process.cwd(),'src/server/...')` if needed.
6. Add `src/server/index.ts` as an explicit server export entrypoint for easier testing and stable imports.
7. Add a small debug script `scripts/debug-require.js` to confirm module resolution for `identifyStages`, `generateMermaid`, `parseSql`, and `utils/canonicalize`. Integrate this script into the debug checklist and CI as a pre-check if desired.

Debugging & verification steps to run locally (Mac)
1. `npm install`
2. `npm run debug:require` — confirms which modules are resolvable and which require fix-ups
3. `npm test` or `npm run test:cjs` — verify tests run in the stabilized test mode
4. If resolution errors persist (e.g., tree nodes like `parseSql` can't be imported), fix import paths in `identifyStages.ts` (use relative imports) and re-run debug script

Why these steps matter
- Ensures unit tests don't fail due to environment / runtime issues.
- Provides a repeatable test harness that is portable across Mac, Codespaces, and CI.
- Reduces time debugging test failures so we can focus on logic issues and implement Option A successfully.

CI & PR verification
- Add a GitHub Action job that runs `npm ci`, `npm test`, `npm run lint`, and `npm audit` at minimum. If ESM is desired as well, add `npm run test:esm`.
- Add checks that verify the debug script resolves all modules as part of the pipeline.

Finish & cleanup
- When tests and debugging pass, remove temporary debug code or keep it gated behind a Debug script.
- Commit structured changes in a feature branch and open a PR with CI that runs the full test suite.

Next steps & options
- Option A (Full PR): Implement full plan (canonicalization, two-pass stage extraction, AST rehydration, tests and CI) after test stabilization completes.
- Option B (Minimal PoC): Implement canonicalization and a few tests to validate the approach then iterate — minimal scope for faster iteration.

Priority: Stabilize tests (PHASE 1) should be completed before implementing PHASE 2+ (Option A) so we can confidently add logic changes and test them.

Next steps & Options for Implementation
--------------------------------------
- Option A (Full PR): Implement canonicalization + robust stage detection + extraction + test coverage. This is the preferred approach.
- Option B (PoC + minimal change): Implement canonicalization and one test (e.g., CTE detection, SELECT INTO) to validate approach, then iterate.

That's the plan. If you'd like, I can implement Option A or B next; tell me which you'd prefer.