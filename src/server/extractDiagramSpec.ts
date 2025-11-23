import type { DiagramSpec, TableSpec, JoinSpec, FilterSpec } from '@/shared/types/diagramSpec';

export function extractDiagramSpec(ast: any): DiagramSpec {
  const spec: DiagramSpec = {
    tables: [],
    joins: [],
    filters: [],
    groupBy: [],
    select: [],
    subqueries: [],
  };

  if (!ast || !ast.type) {
    return spec;
  }

  // Extract based on AST structure
  try {
    if (ast.type === 'select') {
      extractFromSelectStatement(ast, spec);
    }
  } catch (error) {
    console.error('Error extracting diagram spec:', error);
  }

  return spec;
}

function extractFromSelectStatement(node: any, spec: DiagramSpec): void {
  let tableIndex = 0;
  const tableMap = new Map<string, string>(); // Maps table names/aliases to IDs

  // Extract SELECT columns
  if (node.columns && Array.isArray(node.columns)) {
    spec.select = node.columns.map((col: any) => {
      if (typeof col === 'string') return col;
      if (col.expr) return col.expr;
      return JSON.stringify(col);
    });
  }

  // Extract FROM clause
  if (node.from && Array.isArray(node.from)) {
    node.from.forEach((fromItem: any) => {
      if (fromItem.table) {
        const tableName = fromItem.table;
        const alias = fromItem.as || fromItem.alias;
        const id = String.fromCharCode(65 + tableIndex++); // A, B, C...
        
        spec.tables.push({
          id,
          name: tableName,
          alias: alias,
        });
        
        tableMap.set(alias || tableName, id);
      }
    });
  }

  // Extract JOINs
  if (node.join && Array.isArray(node.join)) {
    node.join.forEach((joinItem: any) => {
      if (joinItem.table) {
        const tableName = joinItem.table;
        const alias = joinItem.as || joinItem.alias;
        const id = String.fromCharCode(65 + tableIndex++);
        
        spec.tables.push({
          id,
          name: tableName,
          alias: alias,
        });
        
        tableMap.set(alias || tableName, id);

        // Extract join condition
        const joinType = (joinItem.join || 'INNER').toUpperCase();
        const condition = joinItem.on ? extractConditionText(joinItem.on) : '';
        
        // Try to find which tables are being joined
        const fromTableId = spec.tables[0]?.id || 'A';
        const toTableId = id;
        
        spec.joins.push({
          fromTableId,
          toTableId,
          joinType: normalizeJoinType(joinType),
          condition,
        });
      }
    });
  }

  // Extract WHERE filters
  if (node.where) {
    const filters = extractFilters(node.where, tableMap);
    spec.filters.push(...filters);
  }

  // Extract GROUP BY
  if (node.groupby && Array.isArray(node.groupby)) {
    spec.groupBy = node.groupby.map((col: any) => {
      if (typeof col === 'string') return col;
      if (col.column) return col.column;
      return JSON.stringify(col);
    });
  }
}

function extractFilters(whereNode: any, tableMap: Map<string, string>): FilterSpec[] {
  const filters: FilterSpec[] = [];
  let filterIndex = 1;

  function walk(node: any): void {
    if (!node) return;

    if (node.type === 'binary_expr' && node.operator === 'AND') {
      walk(node.left);
      walk(node.right);
    } else {
      const expression = extractConditionText(node);
      if (expression) {
        filters.push({
          id: `F${filterIndex++}`,
          expression,
        });
      }
    }
  }

  walk(whereNode);
  return filters;
}

function extractConditionText(node: any): string {
  if (!node) return '';
  
  if (typeof node === 'string') return node;
  
  if (node.type === 'binary_expr') {
    const left = extractConditionText(node.left);
    const operator = node.operator || '';
    const right = extractConditionText(node.right);
    return `${left} ${operator} ${right}`.trim();
  }
  
  if (node.type === 'column_ref') {
    return node.column || '';
  }
  
  if (node.type === 'number' || node.type === 'string') {
    return node.value || '';
  }

  if (node.type === 'expr_list') {
    if (Array.isArray(node.value)) {
      return `(${node.value.map(extractConditionText).join(', ')})`;
    }
  }

  // Fallback to JSON representation
  return JSON.stringify(node);
}

function normalizeJoinType(joinType: string): "INNER" | "LEFT" | "RIGHT" | "FULL" | "CROSS" | "UNKNOWN" {
  const normalized = joinType.toUpperCase().replace(/\s+JOIN$/, '').trim();
  
  if (normalized === 'INNER' || normalized === '') return 'INNER';
  if (normalized === 'LEFT' || normalized === 'LEFT OUTER') return 'LEFT';
  if (normalized === 'RIGHT' || normalized === 'RIGHT OUTER') return 'RIGHT';
  if (normalized === 'FULL' || normalized === 'FULL OUTER') return 'FULL';
  if (normalized === 'CROSS') return 'CROSS';
  
  return 'UNKNOWN';
}
