import OpenAI from 'openai';
import type { DiagramSpec } from '@/shared/types/diagramSpec';

export async function getMermaidFromDiagramSpec(spec: DiagramSpec): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    return createErrorDiagram('OpenAI API key not configured');
  }

  // Return error diagram if spec is empty
  if (spec.tables.length === 0 && spec.filters.length === 0) {
    return createErrorDiagram('No tables or filters found in SQL');
  }

  const prompt = buildPrompt(spec);

  try {
    // Initialize OpenAI client here, not at module level
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a Mermaid diagram expert. Generate only valid Mermaid flowchart syntax. Do not include explanations.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    });

    const mermaidCode = response.choices[0]?.message?.content?.trim() || '';
    
    // Extract mermaid code from markdown code blocks if present
    const match = mermaidCode.match(/```mermaid\n([\s\S]*?)\n```/);
    if (match) {
      return match[1].trim();
    }

    // If already valid mermaid, return as-is
    if (mermaidCode.startsWith('flowchart')) {
      return mermaidCode;
    }

    return createErrorDiagram('Failed to generate valid Mermaid diagram');
  } catch (error) {
    console.error('OpenAI API error:', error);
    return createErrorDiagram('Error calling OpenAI API');
  }
}

function buildPrompt(spec: DiagramSpec): string {
  return `Generate a Mermaid flowchart diagram from this SQL diagram specification:

${JSON.stringify(spec, null, 2)}

Requirements:
1. Use flowchart TD (top-down) format
2. Tables as blocks with format: ID[TableName alias]
   Example: A[EDVisits v]
3. Joins as arrows with labels showing the condition:
   Example: A -->|v.SiteId = s.Id| B
4. Filters as nodes under a subgraph for each table:
   Example:
   subgraph Filters_for_TableName
       F1[expression1]
       F2[expression2]
   end
   Connect table to its filters: A --> F1
5. Use short IDs from the spec (A, B, C for tables, F1, F2 for filters)
6. Output ONLY the mermaid code, starting with "flowchart TD"
7. Do not include markdown code fences or explanations

Generate the diagram now:`;
}

function createErrorDiagram(message: string): string {
  return `flowchart TD
    E[${message}]`;
}
