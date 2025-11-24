/**
 * Small helpers to canonicalize and extract table identifiers for matching
 */

export function stripBrackets(s: string): string {
  return s.replace(/^\[|\]$/g, '').replace(/^"|"$/g, '');
}

export function getLastIdentifierPart(s: string): string {
  if (!s) return s;
  // Split by dots and return last part
  const parts = s.split('.').map(p => p.trim());
  return parts[parts.length - 1];
}

export function canonicalizeIdentifier(name: string | undefined | null): string | null {
  if (!name) return null;
  let v = name.trim();
  if (v.startsWith('[') && v.endsWith(']')) {
    v = v.slice(1, -1);
  }
  // Remove outer quotes
  v = v.replace(/^"|"$/g, '');
  // Handle qualifiers: mydb.dbo.table -> table
  v = getLastIdentifierPart(v);
  v = stripBrackets(v);
  v = v.toLowerCase();
  return v;
}

/**
 * When given an AST node with table info, this extracts a reasonable identifier we
 * can compare against a canonical stage set. It accepts object shapes from node-sql-parser.
 */
export function extractTableIdentifierFromNode(node: any): string | null {
  if (!node) return null;
  // If it's a simple string
  if (typeof node === 'string') {
    return canonicalizeIdentifier(node);
  }

  // node may be an object with 'table' or 'expr' or 'value' properties
  if (node.table) {
    // table: 'name' or table: { value: 'name' } or table: { table: 'name' }
    if (typeof node.table === 'string') return canonicalizeIdentifier(node.table);
    if (typeof node.table === 'object') {
      if (node.table.value && typeof node.table.value === 'string') return canonicalizeIdentifier(node.table.value);
      if (node.table.table && typeof node.table.table === 'string') return canonicalizeIdentifier(node.table.table);
      // If db/schema parts are present, try to construct table string
      if (node.table.db || node.table.schema) {
        const parts: string[] = [];
        if (node.table.db) parts.push(node.table.db);
        if (node.table.schema) parts.push(node.table.schema);
        if (node.table.table) parts.push(node.table.table);
        return canonicalizeIdentifier(parts.join('.'));
      }
    }
  }
  if (node.expr && typeof node.expr === 'string') {
    return canonicalizeIdentifier(node.expr as string);
  }
  if (node.expr && typeof node.expr === 'object' && node.expr.table) {
    // Derived table where expr is an object with table info
    const inner = node.expr.table;
    if (typeof inner === 'string') return canonicalizeIdentifier(inner);
    if (inner && typeof inner === 'object' && inner.value) return canonicalizeIdentifier(inner.value);
  }
  if (node.value && typeof node.value === 'string') {
    return canonicalizeIdentifier(node.value);
  }

  // Some node-sql-parser shapes use 'table' nested under 'name' or other paths
  if (node.name && typeof node.name === 'object') {
    if (node.name.value && typeof node.name.value === 'string') return canonicalizeIdentifier(node.name.value);
    if (node.name.table && typeof node.name.table === 'string') return canonicalizeIdentifier(node.name.table);
  }

  // Walk properties shallowly for a string that looks like a table name
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (typeof v === 'string') {
      // simple heuristic, return first plausible identifier-like string
      if (v && /[a-zA-Z0-9_\[\]#\.]+/.test(v)) return canonicalizeIdentifier(v);
    }
    if (typeof v === 'object' && v !== null) {
      if (v.value && typeof v.value === 'string') return canonicalizeIdentifier(v.value);
      if (v.table && typeof v.table === 'string') return canonicalizeIdentifier(v.table);
    }
  }

  // Maybe it's specified under 'name'
  if (node.name && typeof node.name === 'string') return canonicalizeIdentifier(node.name);
  if (node.name && typeof node.name === 'object' && node.name.value) return canonicalizeIdentifier(node.name.value);

  return null;
}

export default {
  canonicalizeIdentifier,
  extractTableIdentifierFromNode
};
