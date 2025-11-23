export interface TableSpec {
  id: string;          // short ID (A, B, C...)
  name: string;        // table name
  alias?: string;
}

export interface JoinSpec {
  fromTableId: string;
  toTableId: string;
  joinType: "INNER" | "LEFT" | "RIGHT" | "FULL" | "CROSS" | "UNKNOWN";
  condition: string;   // raw ON condition text
}

export interface FilterSpec {
  id: string;
  tableId?: string;    // optional table association
  expression: string;  // raw WHERE predicate text
}

export interface SubquerySpec {
  id: string;          // Q1, Q2...
  alias?: string;
  spec: DiagramSpec;   // nested spec
}

export interface DiagramSpec {
  tables: TableSpec[];
  joins: JoinSpec[];
  filters: FilterSpec[];
  groupBy: string[];
  select: string[];
  subqueries: SubquerySpec[];
}
