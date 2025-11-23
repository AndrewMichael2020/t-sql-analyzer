'use client';

import React, { useState } from 'react';
import LayoutShell from '@/components/LayoutShell';
import SqlInputForm from '@/components/SqlInputForm';
import DiagramViewer from '@/components/DiagramViewer';
import MermaidCodeBlock from '@/components/MermaidCodeBlock';

export default function HomePage() {
  const [sql, setSql] = useState('');
  const [mermaidCode, setMermaidCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const handleGenerateDiagram = async () => {
    setIsLoading(true);
    setError(undefined);

    try {
      const response = await fetch('/api/sql-to-diagram', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to generate diagram');
        setMermaidCode(data.mermaid || '');
      } else {
        setMermaidCode(data.mermaid || '');
        setError(undefined);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      setError(message);
      setMermaidCode('flowchart TD\n    E[Network error]');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <LayoutShell>
      <div className="page-container">
        <div className="left-pane">
          <SqlInputForm
            sql={sql}
            onSqlChange={setSql}
            onSubmit={handleGenerateDiagram}
            isLoading={isLoading}
            error={error}
          />
        </div>
        <div className="right-pane">
          <DiagramViewer mermaidCode={mermaidCode} />
          <MermaidCodeBlock mermaidCode={mermaidCode} />
        </div>
      </div>
    </LayoutShell>
  );
}
