'use client';

import React, { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

interface DiagramViewerProps {
  mermaidCode: string;
}

export default function DiagramViewer({ mermaidCode }: DiagramViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mermaidCode || !containerRef.current) {
      return;
    }

    // Initialize mermaid
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
    });

    const renderDiagram = async () => {
      if (!containerRef.current) return;

      try {
        // Clear previous diagram
        containerRef.current.innerHTML = '';

        // Generate unique ID for this diagram
        const id = `mermaid-${Date.now()}`;

        // Render the diagram
        const { svg } = await mermaid.render(id, mermaidCode);
        containerRef.current.innerHTML = svg;
      } catch (error) {
        console.error('Mermaid rendering error:', error);
        containerRef.current.innerHTML = `
          <div class="diagram-error">
            <p>Failed to render diagram</p>
            <pre>${error instanceof Error ? error.message : 'Unknown error'}</pre>
          </div>
        `;
      }
    };

    renderDiagram();
  }, [mermaidCode]);

  if (!mermaidCode) {
    return (
      <div className="diagram-viewer">
        <div className="diagram-placeholder">
          Diagram will appear here once generated.
        </div>
      </div>
    );
  }

  return (
    <div className="diagram-viewer">
      <div ref={containerRef} className="diagram-container" />
    </div>
  );
}
