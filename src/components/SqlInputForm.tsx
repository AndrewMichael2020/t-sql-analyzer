import React from 'react';

interface SqlInputFormProps {
  sql: string;
  onSqlChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  error?: string;
}

export default function SqlInputForm({
  sql,
  onSqlChange,
  onSubmit,
  isLoading,
  error,
}: SqlInputFormProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <div className="sql-input-form">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="sql-input" className="form-label">
            T-SQL Query
          </label>
          <p className="form-helper-text">
            Paste a T-SQL query from CAADSI reports or stored procedures.
          </p>
          <textarea
            id="sql-input"
            className="sql-textarea"
            value={sql}
            onChange={(e) => onSqlChange(e.target.value)}
            placeholder="SELECT * FROM Users WHERE..."
            rows={20}
            disabled={isLoading}
          />
        </div>
        {error && <div className="error-message">{error}</div>}
        <button
          type="submit"
          className="generate-button"
          disabled={isLoading || sql.trim().length === 0}
        >
          {isLoading ? 'Generating...' : 'Generate Diagram'}
        </button>
      </form>
    </div>
  );
}
