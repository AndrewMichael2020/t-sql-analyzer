import { NextResponse } from 'next/server';
import { parseSql } from '@/server/parseSql';
import { extractDiagramSpec } from '@/server/extractDiagramSpec';
import { getMermaidFromDiagramSpec } from '@/server/openAiClient';

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

    // Parse SQL
    let ast;
    try {
      ast = parseSql(sql);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to parse SQL';
      console.error('Parse error:', message);
      return NextResponse.json(
        {
          mermaid: `flowchart TD\n    E[${message}]`,
          spec: null,
          error: message,
        },
        { status: 400 }
      );
    }

    // Extract diagram specification
    const spec = extractDiagramSpec(ast);

    // Generate Mermaid diagram using OpenAI
    let mermaid;
    try {
      mermaid = await getMermaidFromDiagramSpec(spec);
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
