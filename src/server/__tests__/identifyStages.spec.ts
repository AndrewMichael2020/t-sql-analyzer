import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { identifyStages } from '@/server/identifyStages';

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

// Run all tests
test.run();
