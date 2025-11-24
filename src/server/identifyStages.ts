import { Parser } from 'node-sql-parser';
import type { StageSpec, FromItem, JoinItem, WhereItem, GroupByItem } from '@/shared/types/diagramSpec';

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
    const parser = new Parser();
    const ast: any = parser.astify(sqlText, { database: 'TransactSQL' });
    
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
        const tempTableName = intoObj.table || intoObj.expr;
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
        const tempTableName = (stmt as any).table;
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
    
    // Convert parsed stages to StageSpecs
    return parsedStages.map((stage, index) => {
      const spec = extractStageSpec(stage.ast, stage.name, stage.type);
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
function isDependencyTable(tableName: string | null): boolean {
  if (!tableName) return false;
  // CTEs often start with 'cte_' or temp tables start with '#' or '##'
  return tableName.startsWith('cte_') || tableName.startsWith('#');
}

/**
 * Extracts FROM, JOIN, WHERE, GROUP BY from a single stage's AST
 */
function extractStageSpec(ast: any, name: string, type: StageSpec['type']): StageSpec {
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
          if (isDependencyTable(tableName)) {
            dependencySet.add(tableName!);
          }
        }
      } else {
        // This is a regular FROM
        const fromSql = extractFromSql(fromItem);
        if (fromSql) {
          spec.fromItems.push({ sql: fromSql });
          
          // Track dependency if FROM references a CTE or temp table
          const tableName = extractTableName(fromItem);
          if (isDependencyTable(tableName)) {
            dependencySet.add(tableName!);
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
        if (isDependencyTable(tableName)) {
          dependencySet.add(tableName!);
        }
      }
    }
  }
  
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
    // Include schema/database if present
    const parts = [];
    if (fromItem.db) parts.push(fromItem.db);
    if (fromItem.schema) parts.push(fromItem.schema);
    parts.push(fromItem.table);
    tablePart = parts.join('.');
  } else if (fromItem.expr && fromItem.expr.type === 'select') {
    tablePart = '(SELECT ...)'; // Subquery placeholder
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
  if (!item) return null;
  
  if (item.table) {
    return item.table;
  }
  
  return null;
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
    // Include schema/database if present
    const parts = [];
    if (joinItem.db) parts.push(joinItem.db);
    if (joinItem.schema) parts.push(joinItem.schema);
    parts.push(joinItem.table);
    tablePart = parts.join('.');
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
    const args = node.args && Array.isArray(node.args.value) 
      ? node.args.value.map(extractConditionSql).join(', ')
      : '';
    return `${funcName}(${args})`;
  }
  
  // Fallback for unhandled node types - return a readable placeholder
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
