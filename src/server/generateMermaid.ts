import type { DiagramSpec, StageSpec } from '@/shared/types/diagramSpec';
import { canonicalizeIdentifier } from './utils/canonicalize';

/**
 * Generates Mermaid flowchart code from diagram specification
 * This is a deterministic, rules-based generator (no AI)
 */
export function generateMermaidCode(spec: DiagramSpec): string {
  if (!spec.stages || spec.stages.length === 0) {
    return createErrorDiagram('No stages found in SQL');
  }
  
  const lines: string[] = [];
  
  // Start with flowchart declaration
  lines.push('flowchart TD');
  
  // Generate each stage as a subgraph
  for (const stage of spec.stages) {
    lines.push('');
    lines.push(...generateStageSubgraph(stage));
  }
  
  // Generate stage lineage (arrows between stages)
  lines.push('');
  lines.push(...generateStageLineage(spec.stages));
  
  return lines.join('\n');
}

/**
 * Generates a subgraph for a single stage
 */
function generateStageSubgraph(stage: StageSpec): string[] {
  const lines: string[] = [];
  
  // Stage label with type annotation
  const stageLabel = `${stage.name} (${stage.type.replace('_', ' ')})`;
  const escapedLabel = escapeMermaidText(stageLabel);
  
  lines.push(`subgraph ${stage.id}["${escapedLabel}"]`);
  lines.push('    direction TB');
  
  // Track node IDs within this stage
  const nodeIds: string[] = [];
  let nodeIndex = 0;
  
  // Add FROM nodes
  for (const fromItem of stage.fromItems) {
    const nodeId = `${stage.id}_N${nodeIndex++}`;
    const label = `FROM: ${escapeMermaidText(fromItem.sql)}`;
    lines.push(`    ${nodeId}["${label}"]`);
    nodeIds.push(nodeId);
  }
  
  // Add JOIN nodes
  for (const joinItem of stage.joinItems) {
    const nodeId = `${stage.id}_N${nodeIndex++}`;
    const label = `JOIN: ${escapeMermaidText(joinItem.sql)}`;
    lines.push(`    ${nodeId}["${label}"]`);
    nodeIds.push(nodeId);
  }
  
  // Add WHERE nodes
  for (const whereItem of stage.whereItems) {
    const nodeId = `${stage.id}_N${nodeIndex++}`;
    const label = `WHERE: ${escapeMermaidText(whereItem.sql)}`;
    lines.push(`    ${nodeId}["${label}"]`);
    nodeIds.push(nodeId);
  }
  
  // Add GROUP BY nodes
  for (const groupItem of stage.groupByItems) {
    const nodeId = `${stage.id}_N${nodeIndex++}`;
    const label = `GROUP BY: ${escapeMermaidText(groupItem.sql)}`;
    lines.push(`    ${nodeId}["${label}"]`);
    nodeIds.push(nodeId);
  }
  
  // If no nodes were added, add a placeholder to avoid empty subgraph
  if (nodeIds.length === 0) {
    const nodeId = `${stage.id}_N0`;
    lines.push(`    ${nodeId}["(No SQL clauses)"]`);
    nodeIds.push(nodeId);
  }
  
  // Connect nodes sequentially within the stage
  if (nodeIds.length > 1) {
    const connections = nodeIds.slice(0, -1).map((id, i) => 
      `    ${id} --> ${nodeIds[i + 1]}`
    );
    lines.push(...connections);
  }
  
  lines.push('end');
  
  return lines;
}

/**
 * Generates arrows showing dependencies between stages
 */
function generateStageLineage(stages: StageSpec[]): string[] {
  const lines: string[] = [];
  
  // Build a map of stage names to stage IDs
  const nameToId = new Map<string, string>();
  for (const stage of stages) {
    const canon = canonicalizeIdentifier(stage.name) || stage.name;
    nameToId.set(String(canon), stage.id);
  }
  
  // For each stage, draw arrows from its dependencies
  for (const stage of stages) {
    if (stage.dependencies.length > 0) {
      // Find matching stages for each dependency
      for (const depName of stage.dependencies) {
        const depId = nameToId.get(canonicalizeIdentifier(depName) || depName);
        if (depId) {
          lines.push(`${depId} --> ${stage.id}`);
        }
      }
    }
  }
  
  // If no dependencies were found (simple queries), create sequential flow
  if (lines.length === 0 && stages.length > 1) {
    for (let i = 0; i < stages.length - 1; i++) {
      lines.push(`${stages[i].id} --> ${stages[i + 1].id}`);
    }
  }
  
  return lines;
}

/**
 * Escapes text for use in Mermaid labels
 */
function escapeMermaidText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')  // Escape backslashes
    .replace(/"/g, '\\"')    // Escape quotes
    .replace(/\n/g, ' ')     // Replace newlines with spaces
    .replace(/\r/g, '');     // Remove carriage returns
}

/**
 * Creates an error diagram
 */
function createErrorDiagram(message: string): string {
  return `flowchart TD\n    E[${escapeMermaidText(message)}]`;
}
