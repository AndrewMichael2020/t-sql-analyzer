import { NextResponse } from 'next/server';
import { identifyStages } from '@/server/identifyStages';
import { generateMermaidCode } from '@/server/generateMermaid';
import type { DiagramSpec } from '@/shared/types/diagramSpec';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sql } = body;

    // Validate SQL input
    if (!sql || typeof sql !== 'string') {
      return NextResponse.json(
        {
          mermaid: 'flowchart TD\n    E[Error: SQL input is required]',
          spec: null,
          error: 'SQL input is required',
        },
        { status: 400 }
      );
    }

    if (sql.trim().length === 0) {
      return NextResponse.json(
        {
          mermaid: 'flowchart TD\n    E[Error: SQL input cannot be empty]',
          spec: null,
          error: 'SQL input cannot be empty',
        },
        { status: 400 }
      );
    }

    if (sql.length > 50000) {
      return NextResponse.json(
        {
          mermaid: 'flowchart TD\n    E[Error: SQL input too large]',
          spec: null,
          error: 'SQL input too large (max 50,000 characters)',
        },
        { status: 400 }
      );
    }

    // Identify stages (CTEs, temp tables, final SELECT)
    let stages;
    try {
      stages = identifyStages(sql);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to parse SQL';
      console.error('Parse error:', message);
      
      // Create a user-friendly error message
      let userMessage = message;
      
      // Check if it's a parsing error and provide suggestions
      if (message.toLowerCase().includes('parse') || message.toLowerCase().includes('unable')) {
        userMessage = `${message}\n\nTip: This analyzer supports SELECT and INSERT statements with CTEs and temp tables. If your SQL contains advanced T-SQL features like stored procedures, DECLARE statements, WHILE loops, or complex control flow, those parts may not be supported.`;
      }
      
      return NextResponse.json(
        {
          mermaid: `flowchart TD\n    E["Parse Error: ${message.replace(/"/g, '\\"')}"]`,
          spec: null,
          error: userMessage,
        },
        { status: 400 }
      );
    }

    // Build diagram spec
    const spec: DiagramSpec = { stages };

    // Generate Mermaid diagram (deterministic, no AI)
    let mermaid;
    try {
      mermaid = generateMermaidCode(spec);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate diagram';
      console.error('Diagram generation error:', message);
      return NextResponse.json(
        {
          mermaid: `flowchart TD\n    E[${message}]`,
          spec,
          error: message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      mermaid,
      spec,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Unexpected error:', message);
    return NextResponse.json(
      {
        mermaid: 'flowchart TD\n    E[Internal server error]',
        spec: null,
        error: message,
      },
      { status: 500 }
    );
  }
}
