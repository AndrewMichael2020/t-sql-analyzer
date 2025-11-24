import { Parser } from 'node-sql-parser';
import type { StageSpec, FromItem, JoinItem, WhereItem, GroupByItem } from '@/shared/types/diagramSpec';
import { canonicalizeIdentifier, extractTableIdentifierFromNode } from './utils/canonicalize';
import { parseSql } from './parseSql';

interface ParsedStage {
  name: string;
  type: "CTE" | "TEMP_TABLE" | "TEMP_TABLE_INSERT" | "FINAL_SELECT";
  ast: any;
}

/**
 * Identifies all stages (CTEs, temp tables, final SELECT) from SQL
 */
export function identifyStages(sqlText: string): StageSpec[] {
  try {
    const parseResult = parseSql(sqlText);
    const ast: any = parseResult.ast;
    
    const parsedStages: ParsedStage[] = [];
    
    // Handle single statement or array of statements
    const statements = Array.isArray(ast) ? ast : [ast];
    
    for (const stmt of statements) {
      // Extract CTEs from WITH clause
      if ((stmt as any).with) {
        const ctes = Array.isArray((stmt as any).with) ? (stmt as any).with : [(stmt as any).with];
        for (const cte of ctes) {
          // Handle CTE name - could be string or object
          let cteName = '';
          if (typeof cte.name === 'string') {
            cteName = cte.name;
          } else if (cte.name && typeof cte.name === 'object' && cte.name.value) {
            cteName = cte.name.value;
          }
          
          if (cteName && cte.stmt) {
            // The CTE's stmt might be wrapped - check for nested ast
            const stmtAst = cte.stmt.ast || cte.stmt;
            parsedStages.push({
              name: cteName,
              type: "CTE",
              ast: stmtAst
            });
          }
        }
      }
      
      // Now check the main statement itself
      // Check if this is a SELECT INTO (temp table creation)
      if ((stmt as any).type === 'select' && (stmt as any).into) {
        const intoObj = (stmt as any).into;
        // Support multiple AST shapes for INTO
        const tempTableName = extractTableIdentifierFromNode(intoObj) || intoObj || null;
        if (tempTableName) {
          parsedStages.push({
            name: tempTableName,
            type: "TEMP_TABLE",
            ast: stmt
          });
        } else {
          // INTO exists but no table name - treat as final SELECT
          parsedStages.push({
            name: "Final SELECT",
            type: "FINAL_SELECT",
            ast: stmt
          });
        }
      }
      // Check if this is an INSERT INTO (temp table insert)
      else if ((stmt as any).type === 'insert' && (stmt as any).table) {
        const tempTableName = extractTableIdentifierFromNode((stmt as any).table) || (stmt as any).table;
        parsedStages.push({
          name: tempTableName,
          type: "TEMP_TABLE_INSERT",
          ast: (stmt as any).select || stmt
        });
      }
      // Regular SELECT without INTO
      else if ((stmt as any).type === 'select' && !(stmt as any).into) {
        parsedStages.push({
          name: "Final SELECT",
          type: "FINAL_SELECT",
          ast: stmt
        });
      }
    }
    
    // Build canonical stage name set for dependency detection
    const stageNameSet = new Set<string>();
    const stageCanonicalMap = new Map<string, string>(); // canonical -> original
    for (const st of parsedStages) {
      const canon = canonicalizeIdentifier(String(st.name)) || String(st.name).toLowerCase();
      stageNameSet.add(canon);
      stageCanonicalMap.set(canon, String(st.name));
    }

    // Convert parsed stages to StageSpecs using the stage name set
    return parsedStages.map((stage, index) => {
      const spec = extractStageSpec(stage.ast, stage.name, stage.type, stageNameSet);
      spec.id = `S${index}`;
      return spec;
    });
  } catch (error) {
    console.error('Error identifying stages:', error);
    return [];
  }
}

/**
 * Checks if a table name is likely a CTE or temp table dependency
 */
function isDependencyTable(tableName: string | null, stageNameSet?: Set<string>): boolean {
  if (!tableName) return false;
  // If the input is already canonical (lowercased, no brackets) then we can check directly
  const canon = canonicalizeIdentifier(tableName) || String(tableName).toLowerCase();
  if (!stageNameSet) {
    // Fallback heuristics on canonical form
    return canon.startsWith('cte_') || canon.startsWith('#');
  }
  return stageNameSet.has(canon);
}

/**
 * Extracts FROM, JOIN, WHERE, GROUP BY from a single stage's AST
 */
function extractStageSpec(ast: any, name: string, type: StageSpec['type'], stageNameSet?: Set<string>): StageSpec {
  const spec: StageSpec = {
    id: 'S0', // Will be set by caller
    name,
    type,
    fromItems: [],
    joinItems: [],
    whereItems: [],
    groupByItems: [],
    dependencies: []
  };
  
  if (!ast) return spec;
  
  const dependencySet = new Set<string>(); // Track unique dependencies
  const aliasToCanonical = new Map<string, string>();
  
  // Extract FROM clause
  if (ast.from && Array.isArray(ast.from)) {
    for (const fromItem of ast.from) {
      // Check if this is actually a JOIN (has 'join' property)
      if (fromItem.join) {
        // This is a JOIN, not a FROM
        const joinSql = extractJoinSql(fromItem);
        if (joinSql) {
          spec.joinItems.push({ sql: joinSql });
          
          // Track dependency if JOIN references a CTE or temp table
          const tableName = extractTableName(fromItem);
          const canon = extractTableIdentifierFromNode(fromItem) || canonicalizeIdentifier(tableName);
          if (canon && isDependencyTable(canon, stageNameSet)) dependencySet.add(canon!);
        }
      } else {
        // This is a regular FROM
        const fromSql = extractFromSql(fromItem);
        if (fromSql) {
          spec.fromItems.push({ sql: fromSql });
          
            // Track dependency if FROM references a CTE or temp table
            const tableName = extractTableName(fromItem);
            const canon = extractTableIdentifierFromNode(fromItem) || canonicalizeIdentifier(tableName);
            if (canon && isDependencyTable(canon, stageNameSet)) dependencySet.add(canon!);

          // Map aliases to canonical name to support references via alias later in joins
          const aliasName = (fromItem.as || fromItem.alias) || null;
          if (aliasName && tableName) {
            const canon = extractTableIdentifierFromNode(fromItem) || canonicalizeIdentifier(tableName);
            if (canon) aliasToCanonical.set(String(aliasName).toLowerCase(), canon);
          }
        }
      }
    }
  }
  
  // Extract additional JOINs (in case they're in a separate property)
  if (ast.join && Array.isArray(ast.join)) {
    for (const joinItem of ast.join) {
      const joinSql = extractJoinSql(joinItem);
      if (joinSql) {
        spec.joinItems.push({ sql: joinSql });
        
        // Track dependency if JOIN references a CTE or temp table
        const tableName = extractTableName(joinItem);
        const canon = extractTableIdentifierFromNode(joinItem) || canonicalizeIdentifier(tableName);
        if (canon && isDependencyTable(canon, stageNameSet)) dependencySet.add(canon!);

        // If join has alias, map it too
        const aliasName = (joinItem.as || joinItem.alias) || null;
        if (aliasName && tableName) {
          const canon = extractTableIdentifierFromNode(joinItem) || canonicalizeIdentifier(tableName);
          if (canon) aliasToCanonical.set(String(aliasName).toLowerCase(), canon);
        }
      }
    }
  }

  // Walk the AST recursively to detect table references inside subqueries and column refs
  collectTableNamesFromAst(ast, stageNameSet, dependencySet, aliasToCanonical);
  
  // Extract WHERE clauses
  if (ast.where) {
    const whereItems = extractWhereItems(ast.where);
    spec.whereItems = whereItems;
  }
  
  // Extract GROUP BY
  if (ast.groupby) {
    // groupby can be an array or an object with 'columns' property
    const groupByArray = Array.isArray(ast.groupby) ? ast.groupby : 
                        (ast.groupby.columns ? ast.groupby.columns : [ast.groupby]);
    for (const groupItem of groupByArray) {
      const groupSql = extractGroupBySql(groupItem);
      if (groupSql) {
        spec.groupByItems.push({ sql: groupSql });
      }
    }
  }
  
  // Convert dependency set to array
  spec.dependencies = Array.from(dependencySet);
  
  return spec;
}

/**
 * Extracts SQL text for a FROM item
 */
function extractFromSql(fromItem: any): string {
  if (!fromItem) return '';
  
  let tablePart = '';
  if (fromItem.table) {
    // Include schema/database if present and handle object shapes too
    if (typeof fromItem.table === 'string') {
      const parts = [];
      if (fromItem.db) parts.push(fromItem.db);
      if (fromItem.schema) parts.push(fromItem.schema);
      parts.push(fromItem.table);
      tablePart = parts.join('.');
    } else if (typeof fromItem.table === 'object') {
      // Try to compose a db.schema.table from nested properties
      const parts: string[] = [];
      if (fromItem.table.db) parts.push(fromItem.table.db);
      if (fromItem.table.schema) parts.push(fromItem.table.schema);
      if (fromItem.table.table) parts.push(fromItem.table.table);
      if (fromItem.table.value) parts.push(fromItem.table.value);
      tablePart = parts.join('.') || (fromItem.table.value || '');
    }
  } else if (fromItem.expr && fromItem.expr.type === 'select') {
    try {
      const parser = new Parser();
      tablePart = `(${parser.sqlify(fromItem.expr, { database: 'TransactSQL' })})`;
    } catch (e) {
      tablePart = '(SELECT ...)';
    }
  }
  
  const alias = fromItem.as || fromItem.alias;
  if (alias) {
    return `${tablePart} ${alias}`;
  }
  
  return tablePart;
}

/**
 * Extracts table name from FROM or JOIN item
 */
function extractTableName(item: any): string | null {
  // Normalize many AST forms into a string identifier for matching
  if (!item) return null;

  // If item is a plain string
  if (typeof item === 'string') return item;

  // If join or from item contains table information in different structures
  if (item.table) {
    if (typeof item.table === 'string') return item.table;
    if (typeof item.table === 'object') {
      if (item.table.value) return item.table.value;
      if (item.table.table) return item.table.table;
    }
  }

  if (item.name && typeof item.name === 'string') return item.name;
  if (item.name && typeof item.name === 'object' && item.name.value) return item.name.value;

  if (item.expr && typeof item.expr === 'string') return item.expr;
  if (item.expr && typeof item.expr === 'object' && item.expr.type === 'select') return null; // subquery

  if (item.value && typeof item.value === 'string') return item.value;

  return null;
}

/**
 * Recursively collects table names referenced inside an AST node
 * (handles nested subqueries/derived tables) and adds canonical names to dependency set when found
 */
function collectTableNamesFromAst(node: any, stageNameSet?: Set<string>, dependencySet?: Set<string>, aliasToCanonical?: Map<string, string>) {
  if (!node) return;
  // If node has 'from' clause
  if (node.from && Array.isArray(node.from)) {
    for (const fromItem of node.from) {
      const tableName = extractTableName(fromItem);
      if (tableName) {
        const canon = canonicalizeIdentifier(String(tableName));
        if (isDependencyTable(canon, stageNameSet) && dependencySet && canon) dependencySet.add(canon);
      }
      // If this from item is a subquery, traverse it
      if (fromItem.expr && typeof fromItem.expr === 'object' && fromItem.expr.type === 'select') {
        collectTableNamesFromAst(fromItem.expr, stageNameSet, dependencySet, aliasToCanonical);
      }
    }
  }

  // If node has join nodes
  if (node.join && Array.isArray(node.join)) {
    for (const j of node.join) {
      const tableName = extractTableName(j);
      if (tableName) {
        const canon = canonicalizeIdentifier(String(tableName));
        if (isDependencyTable(canon, stageNameSet) && dependencySet && canon) dependencySet.add(canon);
      }
      if (j.expr && typeof j.expr === 'object' && j.expr.type === 'select') {
        collectTableNamesFromAst(j.expr, stageNameSet, dependencySet, aliasToCanonical);
      }
    }
  }

  // If node has where, look for subqueries inside conditions
    if (node.where) {
    if (node.where.type === 'binary_expr') {
      // If either side is a select node (subquery), traverse it
      if (node.where.left && node.where.left.type === 'select') collectTableNamesFromAst(node.where.left, stageNameSet, dependencySet);
      if (node.where.right && node.where.right.type === 'select') collectTableNamesFromAst(node.where.right, stageNameSet, dependencySet);
    }
  }

  // Look for column references that refer to aliases; check whether alias maps to a canonical stage
  if (node.type === 'column_ref' && node.table && aliasToCanonical && dependencySet) {
    const alias = String(node.table).toLowerCase();
    const canon = aliasToCanonical.get(alias);
    if (canon && stageNameSet && stageNameSet.has(canon)) {
      dependencySet.add(canon);
    }
  }

  // Traverse other properties
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) collectTableNamesFromAst(c, stageNameSet, dependencySet, aliasToCanonical);
    } else if (child && typeof child === 'object') {
      collectTableNamesFromAst(child, stageNameSet, dependencySet, aliasToCanonical);
    }
  }
}

/**
 * Extracts SQL text for a JOIN item
 */
function extractJoinSql(joinItem: any): string {
  if (!joinItem) return '';
  
  // The join type might already include the word "JOIN"
  let joinType = '';
  if (joinItem.join) {
    const joinStr = joinItem.join.toUpperCase();
    if (joinStr.includes('JOIN')) {
      joinType = joinStr;
    } else {
      joinType = joinStr + ' JOIN';
    }
  } else {
    joinType = 'JOIN';
  }
  
  let tablePart = '';
  if (joinItem.table) {
    if (typeof joinItem.table === 'string') {
      const parts = [];
      if (joinItem.db) parts.push(joinItem.db);
      if (joinItem.schema) parts.push(joinItem.schema);
      parts.push(joinItem.table);
      tablePart = parts.join('.');
    } else if (typeof joinItem.table === 'object') {
      const parts: string[] = [];
      if (joinItem.table.db) parts.push(joinItem.table.db);
      if (joinItem.table.schema) parts.push(joinItem.table.schema);
      if (joinItem.table.table) parts.push(joinItem.table.table);
      if (joinItem.table.value) parts.push(joinItem.table.value);
      tablePart = parts.join('.') || (joinItem.table.value || '');
    }
  }
  
  const alias = joinItem.as || joinItem.alias;
  if (alias) {
    tablePart = `${tablePart} ${alias}`;
  }
  
  const onCondition = joinItem.on ? extractConditionSql(joinItem.on) : '';
  
  if (onCondition) {
    return `${joinType} ${tablePart} ON ${onCondition}`;
  }
  
  return `${joinType} ${tablePart}`;
}

/**
 * Extracts WHERE items by flattening AND conditions
 */
function extractWhereItems(whereNode: any): WhereItem[] {
  const items: WhereItem[] = [];
  
  function walk(node: any): void {
    if (!node) return;
    
    if (node.type === 'binary_expr' && node.operator === 'AND') {
      // Flatten AND conditions
      walk(node.left);
      walk(node.right);
    } else {
      // This is a single predicate
      const sql = extractConditionSql(node);
      if (sql) {
        items.push({ sql });
      }
    }
  }
  
  walk(whereNode);
  return items;
}

/**
 * Extracts SQL text for a condition (WHERE, ON, etc.)
 */
function extractConditionSql(node: any): string {
  if (!node) return '';
  
  if (typeof node === 'string') return node;
  
  if (node.type === 'binary_expr') {
    const left = extractConditionSql(node.left);
    const operator = node.operator || '';
    const right = extractConditionSql(node.right);
    return `${left} ${operator} ${right}`.trim();
  }
  
  if (node.type === 'column_ref') {
    if (node.table && node.column) {
      return `${node.table}.${node.column}`;
    }
    return node.column || '';
  }
    if (node.type === 'case' || node.type === 'case_expression' || node.type === 'case_when') {
      // Build CASE WHEN ... THEN ... ELSE ... END
      try {
        const parts: string[] = [];
        if (node.args && Array.isArray(node.args.value)) {
          for (const arg of node.args.value) {
            if (arg.type === 'when') {
              const whenExpr = extractConditionSql(arg.when);
              const thenExpr = extractConditionSql(arg.then);
              parts.push(`WHEN ${whenExpr} THEN ${thenExpr}`);
            }
          }
        }
        if (node.else) {
          parts.push(`ELSE ${extractConditionSql(node.else)}`);
        }
        return `CASE ${parts.join(' ')} END`;
      } catch (e) {
        // fall through to parser attempt
      }
    }

    if (node.type === 'cast' || node.type === 'convert') {
      // CAST(expr AS type)
      try {
        const expr = extractConditionSql(node.expr || node.arg || node.value);
        const target = node.as || node.target || node.to || node.type;
        const targetStr = typeof target === 'string' ? target : (target && target.dataType ? target.dataType : '');
        return `CAST(${expr} AS ${targetStr})`;
      } catch (e) {
        // fallthrough
      }
    }
  
  if (node.type === 'number') {
    return String(node.value);
  }
  
  if (node.type === 'string' || node.type === 'single_quote_string' || node.type === 'double_quote_string') {
    return `'${node.value}'`;
  }
  
  if (node.type === 'expr_list') {
    if (Array.isArray(node.value)) {
      return `(${node.value.map(extractConditionSql).join(', ')})`;
    }
  }
  
  if (node.type === 'function') {
    const funcName = node.name || '';
    // args can be { value: [...] } or an array
    const argsArray = node.args && node.args.value ? node.args.value : (Array.isArray(node.args) ? node.args : []);
    const args = Array.isArray(argsArray) ? argsArray.map(extractConditionSql).join(', ') : '';
    // If function node has an 'over' clause (window function) rehydrate it
    if (node.over) {
      const overParts = [];
      if (node.over.partition) overParts.push('PARTITION BY ' + (Array.isArray(node.over.partition) ? node.over.partition.map(extractConditionSql).join(', ') : extractConditionSql(node.over.partition)));
      if (node.over.orderby || node.over.order) {
        const order = node.over.orderby || node.over.order;
        // order may be an array or object
        const orderStr = Array.isArray(order) ? order.map(extractConditionSql).join(', ') : extractConditionSql(order);
        overParts.push('ORDER BY ' + orderStr);
      }
      const overStr = overParts.length ? ` OVER(${overParts.join(' ')})` : ' OVER()';
      return `${funcName}(${args})${overStr}`.trim();
    }
    return `${funcName}(${args})`;
  }
  
  // Fallback for unhandled node types - attempt to re-hydrate SQL from AST or provide placeholder
  try {
    const parser = new Parser();
    const sqlStr = parser.sqlify(node, { database: 'TransactSQL' });
    if (sqlStr) return sqlStr;
  } catch (e) {
    // ignore and return placeholder below
  }

  return '[Complex Expression]';
}

/**
 * Extracts SQL text for a GROUP BY item
 */
function extractGroupBySql(groupItem: any): string {
  if (!groupItem) return '';
  
  if (typeof groupItem === 'string') return groupItem;
  
  if (groupItem.type === 'column_ref') {
    if (groupItem.table && groupItem.column) {
      return `${groupItem.table}.${groupItem.column}`;
    }
    return groupItem.column || '';
  }
  
  return extractConditionSql(groupItem);
}
