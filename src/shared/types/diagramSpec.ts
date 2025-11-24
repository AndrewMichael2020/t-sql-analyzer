// New stage-based types for the updated logic

export interface FromItem {
  sql: string;  // Full FROM clause SQL (e.g., "dbo.EDVisits v" or "cte_EDVisitsRecent r")
}

export interface JoinItem {
  sql: string;  // Full JOIN clause SQL (e.g., "LEFT JOIN dbo.Patients p ON r.PatientId = p.Id")
}

export interface WhereItem {
  sql: string;  // Individual WHERE predicate SQL (e.g., "v.VisitDate >= '2024-01-01'")
}

export interface GroupByItem {
  sql: string;  // Individual GROUP BY expression (e.g., "s.SiteName")
}

export interface StageSpec {
  id: string;           // Stage ID (S0, S1, S2, ...)
  name: string;         // Stage name (CTE name, temp table name, or "Final SELECT")
  type: "CTE" | "TEMP_TABLE" | "TEMP_TABLE_INSERT" | "FINAL_SELECT";
  fromItems: FromItem[];
  joinItems: JoinItem[];
  whereItems: WhereItem[];
  groupByItems: GroupByItem[];
  dependencies: string[];  // Names of stages this depends on (CTE names, temp table names)
}

export interface DiagramSpec {
  stages: StageSpec[];
}

// Legacy types kept for backward compatibility during migration
export interface TableSpec {
  id: string;
  name: string;
  alias?: string;
}

export interface JoinSpec {
  fromTableId: string;
  toTableId: string;
  joinType: "INNER" | "LEFT" | "RIGHT" | "FULL" | "CROSS" | "UNKNOWN";
  condition: string;
}

export interface FilterSpec {
  id: string;
  tableId?: string;
  expression: string;
}

export interface SubquerySpec {
  id: string;
  alias?: string;
  spec: any;
}

export interface LegacyDiagramSpec {
  tables: TableSpec[];
  joins: JoinSpec[];
  filters: FilterSpec[];
  groupBy: string[];
  select: string[];
  subqueries: SubquerySpec[];
}
