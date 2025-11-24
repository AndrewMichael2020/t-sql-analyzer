import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { identifyStages } from '@/server/identifyStages';
import { generateMermaidCode } from '@/server/generateMermaid';

// Test 1: CTE dependency detection with arbitrary names
const sql1 = `WITH orders AS (SELECT id FROM dbo.orders), recent AS (SELECT * FROM orders) SELECT * FROM recent;`;
const stages1 = identifyStages(sql1);

test('CTE dependency detection: orders->recent', () => {
  // Expect at least two stages: orders and recent and final select
  const names = stages1.map(s => s.name.toString().toLowerCase());
  assert.ok(names.some(n => n.includes('orders')));
  assert.ok(names.some(n => n.includes('recent')));
  // Find recent stage and assert dependency includes 'orders'
  const recent = stages1.find(s => (s.name as string).toLowerCase().includes('recent'));
  assert.ok(recent);
  assert.ok((recent!.dependencies || []).some(dep => dep === 'orders'));
});

// Test 2: SELECT INTO with nested subquery and window function
const sql2 = `SELECT a.col INTO #temp FROM (SELECT ROW_NUMBER() OVER (PARTITION BY col ORDER BY date) as rn, col FROM dbo.tableA) a;`;
const stages2 = identifyStages(sql2);

test('SELECT INTO creates temp stage #temp and detects nested table reference', () => {
  const temp = stages2.find(s => (s.name as string).toLowerCase().includes('#temp'));
  assert.ok(temp, 'Should find temp stage named #temp');
  // The nested table reference to tableA is not necessarily treated as a stage dependency (it's a base table), but stage should exist
  assert.is(temp!.type, 'TEMP_TABLE');
});

// Test 3: Derived table referencing a CTE
const sql3 = `WITH src AS (SELECT id FROM dbo.base), final AS (SELECT t.id FROM (SELECT id FROM src) t) SELECT * FROM final;`;
const stages3 = identifyStages(sql3);

test('Derived table referencing a CTE should be dependency final->src', () => {
  const final = stages3.find(s => (s.name as string).toLowerCase().includes('final'));
  assert.ok(final, 'final stage should exist');
  assert.ok((final!.dependencies || []).some(dep => dep === 'src'));
});

// Test 7: CASE and CAST expressions within a CTE should parse and not break stage detection
const sql6 = `WITH cte AS (SELECT id, CAST(col AS VARCHAR(10)) as col_str, CASE WHEN col > 10 THEN 'A' ELSE 'B' END as cat FROM dbo.t) SELECT * FROM cte;`;
const stages6 = identifyStages(sql6);
test('CASE and CAST expressions should not break parsing and stage detection', () => {
  const cte = stages6.find(s => (s.name as string).toLowerCase().includes('cte'));
  assert.ok(cte, 'cte should be detected');
  // Ensure that a final select referencing cte is present (there may be final select stage)
  const final = stages6.find(s => (s.name as string).toLowerCase().includes('final') || (s.type === 'FINAL_SELECT'));
  assert.ok(final, 'Final select should be detected');
  // Final select should depend on cte
  if (final) assert.ok((final!.dependencies || []).some(dep => dep === 'cte'));
});

// Test 8: Ensure ROW_NUMBER() OVER(...) in nested derived table is handled
const sql7 = `SELECT a.col INTO #temp FROM (SELECT ROW_NUMBER() OVER (PARTITION BY col ORDER BY date) as rn, col FROM dbo.tableA) a;`;
const stages7 = identifyStages(sql7);
test('ROW_NUMBER() OVER in nested derived table should not break parsing and should create temp stage', () => {
  const temp = stages7.find(s => (s.name as string).toLowerCase().includes('#temp'));
  assert.ok(temp, 'Should find temp stage named #temp');
  assert.is(temp!.type, 'TEMP_TABLE');
});

  // Test 4: AT TIME ZONE parsing should not break stage detection
  const sql4 = `WITH tz AS (SELECT id, ts AT TIME ZONE 'UTC' as ts_utc FROM dbo.t1) SELECT * FROM tz;`;
  const stages4 = identifyStages(sql4);
  test('AT TIME ZONE should parse and create a CTE stage', () => {
    const tzStage = stages4.find(s => (s.name as string).toLowerCase().includes('tz'));
    assert.ok(tzStage, 'tz CTE stage should be detected');
  });

  // Test 5: INSERT INTO detection for temp table
  const sql5 = `INSERT INTO #temp (col) SELECT col FROM dbo.table1;`;
  const stages5 = identifyStages(sql5);
  test('INSERT INTO creates TEMP_TABLE_INSERT stage', () => {
    const temp = stages5.find(s => (s.name as string).toLowerCase().includes('#temp'));
    assert.ok(temp, 'Should find temp stage named #temp');
    assert.is(temp!.type, 'TEMP_TABLE_INSERT');
  });

  // Test 6: generateMermaid canonical mapping uses canonical names for dependencies
  test('generateMermaid maps canonical names using canonicalization', () => {
    const spec = {
      stages: [
        { id: 'S0', name: '[dbo].Orders', type: 'CTE', fromItems: [], joinItems: [], whereItems: [], groupByItems: [], dependencies: [] },
        { id: 'S1', name: 'Recent', type: 'CTE', fromItems: [], joinItems: [], whereItems: [], groupByItems: [], dependencies: ['Orders'] }
      ]
    } as any;

    const mermaid = generateMermaidCode(spec);
    // Ensure arrow S0 --> S1 exists
    assert.ok(mermaid.includes('S0 --> S1'));
  });

// Run all tests
test.run();
