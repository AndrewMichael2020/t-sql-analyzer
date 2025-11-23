# T-SQL Flowchart Visualizer

A web application that converts T-SQL queries into Mermaid flowchart diagrams using AI-powered analysis.

## Features

- **Parse T-SQL**: Deterministic SQL parsing using ts-sql-parser
- **Extract Structure**: Automatic extraction of tables, joins, filters, and subqueries
- **AI-Powered Diagrams**: Uses OpenAI GPT-4o-mini to generate clean Mermaid flowcharts
- **Interactive UI**: Clean, two-pane interface inspired by Mermaid Exporter
- **Copy & Share**: Easy copying of generated Mermaid code

## Tech Stack

- **Framework**: Next.js 14 (App Router) with TypeScript
- **Frontend**: React, Mermaid.js
- **Backend**: Next.js Route Handlers
- **SQL Parser**: ts-sql-parser
- **AI**: OpenAI GPT-4o-mini
- **Deployment**: Docker + Google Cloud Run

## Getting Started

### Prerequisites

- Node.js 20+ LTS
- OpenAI API key

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd t-sql-analyzer
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file from the example:
```bash
cp .env.example .env
```

4. Add your OpenAI API key to `.env`:
```
OPENAI_API_KEY=your_actual_api_key_here
```

### Development

Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

Build the application:
```bash
npm run build
```

Start the production server:
```bash
npm run start
```

### Docker

Build the Docker image:
```bash
docker build -t t-sql-flowchart-visualizer .
```

Run the container:
```bash
docker run -p 3000:3000 -e OPENAI_API_KEY=your_key t-sql-flowchart-visualizer
```

## Usage

1. Paste your T-SQL query into the left text area
2. Click "Generate Diagram"
3. View the generated Mermaid flowchart on the right
4. Copy the Mermaid code for use in documentation

## Architecture

```
/src
  /app              # Next.js App Router pages and API
    /api
      /sql-to-diagram
        route.ts    # POST endpoint for diagram generation
    layout.tsx      # Root layout
    page.tsx        # Home page
    globals.css     # Global styles
  /components       # React components
    LayoutShell.tsx
    SqlInputForm.tsx
    DiagramViewer.tsx
    MermaidCodeBlock.tsx
  /server          # Server-side logic
    parseSql.ts
    extractDiagramSpec.ts
    openAiClient.ts
  /shared          # Shared types
    /types
      diagramSpec.ts
```

## How It Works

1. **Parse**: SQL is parsed into an AST using ts-sql-parser
2. **Extract**: The AST is analyzed to extract tables, joins, filters, etc.
3. **Generate**: The extracted structure is sent to GPT-4o-mini to generate Mermaid code
4. **Render**: The Mermaid code is rendered in the browser using mermaid.js

## Example

Input SQL:
```sql
SELECT s.Site, COUNT(*) AS VisitCount
FROM EDVisits v
INNER JOIN Sites s ON v.SiteId = s.Id
WHERE v.Acuity IN (1,2,3) AND v.VisitDate >= '2024-01-01'
GROUP BY s.Site;
```

Output: A Mermaid flowchart showing:
- Tables as blocks (EDVisits, Sites)
- Join relationships with conditions
- Filters grouped by table
- Clean, readable diagram structure

## License

See LICENSE file for details.
