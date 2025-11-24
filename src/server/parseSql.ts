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
  
  // Remove block comments /* ... */ to avoid issues with nested comments and comment parsing
  s = s.replace(/\/\*[\s\S]*?\*\//g, ' ');
  
  // Remove single-line comments -- ...
  s = s.replace(/--[^\n\r]*/g, ' ');
  
  // Remove IF OBJECT_ID(...) DROP TABLE statements (both with and without tempdb schema)
  // Examples:
  // - IF OBJECT_ID('tempdb..#RawVisits') IS NOT NULL DROP TABLE #RawVisits;
  // - IF OBJECT_ID('dbo.TableName', 'U') IS NOT NULL DROP TABLE dbo.TableName;
  s = s.replace(/IF\s+OBJECT_ID\s*\([^)]+\)\s+IS\s+NOT\s+NULL\s+DROP\s+TABLE\s+[^;]+;?/gi, '');
  
  // Remove IF EXISTS (...) DROP TABLE statements
  // Example: IF EXISTS (SELECT 1 FROM tempdb.sys.tables WHERE name LIKE '#History%') DROP TABLE #History;
  s = s.replace(/IF\s+EXISTS\s*\([^)]+\)\s+DROP\s+TABLE\s+[^;]+;?/gi, '');
  
  // Remove standalone DROP TABLE IF EXISTS statements (T-SQL 2016+)
  // Example: DROP TABLE IF EXISTS #TempTable;
  s = s.replace(/DROP\s+TABLE\s+IF\s+EXISTS\s+[^;]+;?/gi, '');
  
  // Remove table hints like WITH (NOLOCK), WITH (READUNCOMMITTED), etc.
  // These appear after table names in FROM/JOIN clauses
  s = s.replace(/WITH\s*\(\s*(NOLOCK|READUNCOMMITTED|UPDLOCK|ROWLOCK|TABLOCK|PAGLOCK|HOLDLOCK|READPAST|READCOMMITTED|REPEATABLEREAD|SERIALIZABLE)\s*\)/gi, '');
  
  // Convert T-SQL assignment-style column aliases to standard AS syntax, but NOT for CASE expressions
  // Example: ", ProtocolUsed = p.ProtocolUsed" -> ", p.ProtocolUsed AS ProtocolUsed"
  // But NOT: ", DispositionBucket = CASE WHEN..." (handled separately below)
  // Match pattern: comma, whitespace, identifier, whitespace, equals, whitespace, table.column or column
  s = s.replace(/,(\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([a-zA-Z_#][a-zA-Z0-9_#]*\.[a-zA-Z_][a-zA-Z0-9_]*)/g, ',$1$3 AS $2');
  
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
  // We need to be careful not to match nested parentheses incorrectly
  // This is a best-effort approach
  s = s.replace(/OVER\s*\([^)]*\)/gi, '');
  
  // Remove IIF(...) by converting to a placeholder CASE WHEN (basic best-effort)
  // This is a naive transformation but sufficient to avoid parsing errors in many cases
  s = s.replace(/IIF\s*\(/gi, 'CASE WHEN (');
  
  // Collapse multiple spaces
  s = s.replace(/\s+/g, ' ');
  return s.trim();
}

export function parseSql(originalSql: string): ParseResult {
  const parser = new Parser();
  let lastError: Error | null = null;
  
  // First attempt: original SQL
  try {
    const ast = parser.astify(originalSql, { database: 'TransactSQL' });
    return { originalSql, sql: originalSql, sanitized: false, ast };
  } catch (err) {
    lastError = err instanceof Error ? err : new Error(String(err));
    // Try sanitized SQL
    const sanitizedSql = sanitizeSqlForParser(originalSql);
    try {
      const ast = parser.astify(sanitizedSql, { database: 'TransactSQL' });
      return { originalSql, sql: sanitizedSql, sanitized: true, ast };
    } catch (err2) {
      lastError = err2 instanceof Error ? err2 : new Error(String(err2));
      // As a last resort, return a parse result with null AST but capture the error details
      console.error('Failed to parse SQL. Original error:', err instanceof Error ? err.message : String(err));
      console.error('After sanitization error:', lastError.message);
      return { originalSql, sql: sanitizedSql, sanitized: true, ast: null };
    }
  }
}
