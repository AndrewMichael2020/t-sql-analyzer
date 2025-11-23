import { Parser } from 'ts-sql-parser';

export function parseSql(sql: string): any {
  try {
    const parser = new Parser();
    const ast = parser.parse(sql);
    return ast;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown parse error';
    throw new Error(`Failed to parse SQL: ${message}`);
  }
}
