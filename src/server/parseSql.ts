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
