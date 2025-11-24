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
    if (typeof node.table === 'string') return canonicalizeIdentifier(node.table);
    if (typeof node.table === 'object' && node.table.value) return canonicalizeIdentifier(node.table.value);
  }
  if (node.expr && typeof node.expr === 'string') {
    return canonicalizeIdentifier(node.expr as string);
  }
  if (node.value && typeof node.value === 'string') {
    return canonicalizeIdentifier(node.value);
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
