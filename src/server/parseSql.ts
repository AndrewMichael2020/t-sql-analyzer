import { Parser } from 'node-sql-parser';

export interface ParseResult {
  originalSql: string; // The original SQL the user supplied
  sql: string; // The sql used for parsing (possibly sanitized)
  sanitized: boolean; // Whether the sql was sanitized before parse
  ast: any; // AST returned from parser
}

function sanitizeSqlForParser(sql: string): string {
  let s = sql;
  // Remove common T-SQL constructs that confuse the parser but don't affect table references
  
  // Remove schema qualifiers from CTE names in WITH clause (e.g., "WITH [dbo].Orders AS" -> "WITH Orders AS")
  // Pattern for SQL identifier (with or without brackets): [schema_name] or schema_name
  // T-SQL identifiers can contain letters, digits, _, @, #, and $ (and hyphens if bracketed)
  const schemaQualifiedIdentifier = /(?:\[?[a-zA-Z0-9_@#$-]+\]?\.)?(\[?[a-zA-Z0-9_@#$-]+\]?)/;
  
  // Match "WITH [schema].name AS" or "WITH schema.name AS" and keep only the name
  s = s.replace(new RegExp(`WITH\\s+${schemaQualifiedIdentifier.source}\\s+AS`, 'gi'), 'WITH $1 AS');
  
  // Also handle comma-separated CTEs: ", [schema].name AS" -> ", name AS"
  s = s.replace(new RegExp(`,\\s+${schemaQualifiedIdentifier.source}\\s+AS`, 'gi'), ', $1 AS');
  
  // Remove "AT TIME ZONE <tz>"
  s = s.replace(/\sAT\s+TIME\s+ZONE\s+[^\s,;\)]+/gi, '');
  // Remove OVER (...) window clauses to avoid complex function parsing
  s = s.replace(/OVER\s*\([^\)]*\)/gi, '');
  // Remove IIF(...) by converting to a placeholder CASE WHEN (basic best-effort)
  // This is a naive transformation but sufficient to avoid parsing errors in many cases
  s = s.replace(/IIF\s*\(/gi, 'CASE WHEN (');
  // Collapse multiple spaces
  s = s.replace(/\s+/g, ' ');
  return s.trim();
}

export function parseSql(originalSql: string): ParseResult {
  const parser = new Parser();
  // First attempt: original SQL
  try {
    const ast = parser.astify(originalSql, { database: 'TransactSQL' });
    return { originalSql, sql: originalSql, sanitized: false, ast };
  } catch (err) {
    // Try sanitized SQL
    const sanitizedSql = sanitizeSqlForParser(originalSql);
    try {
      const ast = parser.astify(sanitizedSql, { database: 'TransactSQL' });
      return { originalSql, sql: sanitizedSql, sanitized: true, ast };
    } catch (err2) {
      const message = (err2 instanceof Error && err2.message) ? err2.message : 'Unknown parse error';
      // As a last resort, return a parse result with null AST but keep original SQL
      return { originalSql, sql: sanitizedSql, sanitized: true, ast: null };
    }
  }
}
