'use client';

import React, { useState } from 'react';

interface MermaidCodeBlockProps {
  mermaidCode: string;
}

export default function MermaidCodeBlock({ mermaidCode }: MermaidCodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(mermaidCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  if (!mermaidCode) {
    return (
      <div className="mermaid-code-block">
        <div className="code-placeholder">Mermaid code will appear here.</div>
      </div>
    );
  }

  return (
    <div className="mermaid-code-block">
      <div className="code-header">
        <span className="code-label">Mermaid Code</span>
        <button
          onClick={handleCopy}
          className="copy-button"
          aria-label="Copy code"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="code-content">
        <code>{mermaidCode}</code>
      </pre>
    </div>
  );
}
