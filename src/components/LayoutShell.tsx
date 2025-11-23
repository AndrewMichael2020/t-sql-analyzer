import React from 'react';

interface LayoutShellProps {
  children: React.ReactNode;
}

export default function LayoutShell({ children }: LayoutShellProps) {
  return (
    <div className="layout-shell">
      <header className="header">
        <div className="header-content">
          <h1 className="app-title">SQL → Mermaid Flowchart</h1>
          <p className="app-subtitle">Visualize T-SQL queries as Mermaid diagrams</p>
        </div>
      </header>
      <main className="main-content">{children}</main>
    </div>
  );
}
