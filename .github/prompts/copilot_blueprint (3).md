# copilot_blueprint.md — SQL-to-Flowchart Visualizer (Next.js + Cloud Run)

## 0. Intent

We want a **small, clean, TypeScript-based web app** that:

1. Accepts **T-SQL (SQL Server)** pasted into a textbox.
2. Parses it deterministically into an AST.
3. Extracts a **structured JSON “diagram spec”** (tables, joins, filters, group-by, nested subqueries).
4. Sends the spec to **OpenAI `gpt-4o-mini`** to generate **Mermaid `flowchart TD` code**.
5. Renders the Mermaid diagram in the browser.
6. Uses a **Next.js UI** whose first page **looks and behaves like** the existing Mermaid Exporter app at  
   `https://mermaid-exporter--studio-1697788595-a34f5.us-central1.hosted.app/`:
   - Single-page layout.
   - Large text input for content on the left.
   - Diagram preview and Mermaid code pane on the right.
   - Clear call-to-action button to generate/update the diagram.
7. Runs as a **single container** on **Google Cloud Run**.

We **do not allow any freedom to choose frameworks**.  
Use exactly:

- Next.js (App Router)
- React
- TypeScript
- Node (LTS)
- Express **not needed**; use Next.js **Route Handlers** for the API.

The repo must stay **minimal**, readable, and free from duplicated logic.  
Prefer small pure functions, clear boundaries, and no unnecessary abstractions.

Copilot should help:
- scaffold the repo,
- create all files listed here,
- keep code concise and focused,
- avoid copy-paste between modules.

---

## 1. Tech Stack (fixed)

- **Framework:** Next.js (App Router) with TypeScript.
- **Runtime:** Node.js LTS.
- **Frontend:** React components rendered by Next.js.
- **Backend:** Next.js Route Handler under `/app/api/sql-to-diagram/route.ts`.
- **LLM:** OpenAI `gpt-4o-mini` via the official `openai` Node SDK or `fetch`.
- **SQL Parser:** `ts-sql-parser` configured for **T-SQL**.
- **Diagrams:** Mermaid (client-side rendering in the browser).
- **Deployment:** Docker container running the Next.js app, deployed to **Cloud Run**.
- **Config:** `.env` for `OPENAI_API_KEY` and any other secrets.

No alternative stacks. No Vite. No custom Express server. Only Next.js.

---

## 2. High-Level Architecture

```
Browser (Next.js React UI)
  ├─ Home page (/) with two main panes
  │    ├─ Left: SQL input + controls
  │    └─ Right: Diagram preview + Mermaid code
  │
  └─ Calls backend API:
       POST /api/sql-to-diagram
         body: { sql: string }

Next.js backend (Route Handler)
  ├─ parseSql(sql) -> AST         // ts-sql-parser
  ├─ extractDiagramSpec(ast)      // deterministic extraction
  ├─ getMermaidFromDiagramSpec    // OpenAI gpt-4o-mini -> mermaid
  └─ returns { mermaid: string, spec: DiagramSpec }
```

We never send raw SQL to the LLM.  
We only send the **diagram spec JSON**.

---

## 3. Data Structures

Copilot should create `DiagramSpec` types in a shared module that can be imported by both API and any client-side visualization logic (if needed).

```ts
// src/shared/types/diagramSpec.ts
export interface TableSpec {
  id: string;          // short ID (A, B, C...)
  name: string;        // table name
  alias?: string;
}

export interface JoinSpec {
  fromTableId: string;
  toTableId: string;
  joinType: "INNER" | "LEFT" | "RIGHT" | "FULL" | "CROSS" | "UNKNOWN";
  condition: string;   // raw ON condition text
}

export interface FilterSpec {
  id: string;
  tableId?: string;    // optional table association
  expression: string;  // raw WHERE predicate text
}

export interface SubquerySpec {
  id: string;          // Q1, Q2...
  alias?: string;
  spec: DiagramSpec;   // nested spec
}

export interface DiagramSpec {
  tables: TableSpec[];
  joins: JoinSpec[];
  filters: FilterSpec[];
  groupBy: string[];
  select: string[];
  subqueries: SubquerySpec[];
}
```

The **only** thing the LLM sees is `DiagramSpec`.

---

## 4. Folder Structure (Next.js App Router)

Copilot should scaffold the repo like this:

```text
/sql-flowchart-visualizer/
  package.json
  tsconfig.json
  next.config.mjs
  .eslintrc.cjs
  .gitignore
  .env.example

  /src/
    /app/
      layout.tsx
      page.tsx

      /api/
        /sql-to-diagram/
          route.ts

    /components/
      SqlInputForm.tsx
      DiagramViewer.tsx
      MermaidCodeBlock.tsx
      LayoutShell.tsx

    /shared/
      types/
        diagramSpec.ts

    /server/
      parseSql.ts
      extractDiagramSpec.ts
      openAiClient.ts
```

Notes:

- `/src/app` uses Next App Router.
- `/src/app/page.tsx` is the **main UI page**, modeled after the existing Mermaid Exporter:
  - clean header at the top.
  - two-column responsive main section.
- The API lives under `/src/app/api/sql-to-diagram/route.ts`.
- Type definitions live in `/src/shared/types`.
- Parser and OpenAI logic live under `/src/server` (server-only modules).

Avoid duplicating type definitions between server and client; reuse from `/src/shared/types/diagramSpec.ts`.

---

## 5. Backend Responsibilities (Next.js Route Handler)

### 5.1 `/src/app/api/sql-to-diagram/route.ts`

- Implements a `POST` handler.
- Expects JSON body `{ sql: string }`.
- Validates `sql` presence and length.
- Calls three functions in order:
  1. `parseSql(sql)` → AST
  2. `extractDiagramSpec(ast)` → `DiagramSpec`
  3. `getMermaidFromDiagramSpec(spec)` → Mermaid string
- Returns `{ mermaid: string, spec: DiagramSpec }` as JSON.

On parse or LLM error:
- Respond with status `400` and a fallback Mermaid snippet:

  ```mermaid
  flowchart TD
      E[Error parsing SQL or generating diagram]
  ```

### 5.2 `/src/server/parseSql.ts`

- Import and configure `ts-sql-parser` for T-SQL.
- Export:

  ```ts
  export function parseSql(sql: string): any;
  ```

Requirements:

- Wrap parser exceptions in a simple `Error` with a clear message like `"Failed to parse SQL"`.
- Keep it pure (no logging except optional console.debug).

### 5.3 `/src/server/extractDiagramSpec.ts`

- Export:

  ```ts
  import type { DiagramSpec } from "@/shared/types/diagramSpec";

  export function extractDiagramSpec(ast: any): DiagramSpec;
  ```

- Deterministically walk the AST and populate:
  - `tables` (FROM + JOIN + subqueries)
  - `joins` (JOIN clauses)
  - `filters` (WHERE predicate expressions, possibly split by AND)
  - `groupBy` (raw group-by expressions as strings)
  - `select` (raw select expressions as strings)
  - `subqueries` (nested SELECTs as `SubquerySpec`)

Rules:

- Keep extraction logic simple.
- Use small helper functions instead of one huge function.
- Do **not** interpret business logic; just capture structure.
- For complex T-SQL constructs, fall back to raw strings.

### 5.4 `/src/server/openAiClient.ts`

- Wrap OpenAI API calls.
- Read `OPENAI_API_KEY` from environment.
- Export:

  ```ts
  import type { DiagramSpec } from "@/shared/types/diagramSpec";

  export async function getMermaidFromDiagramSpec(spec: DiagramSpec): Promise<string>;
  ```

Prompt strategy for `gpt-4o-mini`:

- Instruct the model to output **only**:

  ```
  ```mermaid
  flowchart TD
  ...
  ```
  ```

- Mermaid rules:

  - Tables as large blocks:

    ```mermaid
    A[EDVisits v]
    ```

  - Joins as arrows with labels:

    ```mermaid
    A -->|v.SiteId = s.Id| B
    ```

  - Filters as subgraphs per table:

    ```mermaid
    subgraph Filters_for_EDVisits_v
        F1[v.Acuity IN (1,2,3)]
        F2[v.VisitDate >= '2024-01-01']
    end

    A --> F1
    A --> F2
    ```

  - Subqueries as nested subgraphs:

    ```mermaid
    subgraph Subquery_Q1
        ...
    end
    ```

- Always use short node IDs (A, B, C, F1, F2, Q1).
- If the spec is empty or invalid, return a simple error diagram instead of throwing.

Keep this module focused and minimal.

---

## 6. UI Requirements (Next.js, first page like Mermaid Exporter)

The **home page** at `/` should visually and functionally mirror the existing Mermaid Exporter app, adapted for SQL:

### 6.1 LayoutShell component

- File: `/src/components/LayoutShell.tsx`
- Provides a basic two-part layout:
  - Header bar at the top with:
    - App name: `SQL → Mermaid Flowchart`
    - Small subtitle: `Visualize T-SQL queries as Mermaid diagrams`
  - Main content region below, using a responsive **two-column layout**:
    - Left pane: input area (SQL).
    - Right pane: diagram preview and Mermaid code.

- Use simple, clean styling:
  - CSS modules or a small global CSS file.
  - Do **not** pull in heavy component libraries.
  - Use flexbox or CSS grid for the two columns.
  - On narrow screens (< 768px), stack vertically (SQL on top, diagram below).

### 6.2 `page.tsx` (Home page)

- File: `/src/app/page.tsx`
- Uses `LayoutShell` to define layout.
- Inside the main area, create a **split pane**:

  - Left: `<SqlInputForm />`
  - Right: a vertical stack of:
    - `<DiagramViewer />`
    - `<MermaidCodeBlock />`

- The structure should visually resemble:

  ```
  ┌────────────────────────────────────────────┐
  │ Header: SQL → Mermaid Flowchart           │
  └────────────────────────────────────────────┘
  ┌─────────────────────┬──────────────────────┐
  │  SQL Input (left)   │ Diagram + Code (right│
  │  textarea, button   │ preview, mermaid code│
  └─────────────────────┴──────────────────────┘
  ```

- When "Generate diagram" is clicked, `page.tsx` should:
  - Call `/api/sql-to-diagram` via `fetch`.
  - Handle loading and error states.
  - Pass `mermaid` to `<DiagramViewer />`.
  - Pass the same `mermaid` string to `<MermaidCodeBlock />`.

### 6.3 `SqlInputForm.tsx`

- File: `/src/components/SqlInputForm.tsx`
- Props:

  ```ts
  interface SqlInputFormProps {
    sql: string;
    onSqlChange: (value: string) => void;
    onSubmit: () => void;
    isLoading: boolean;
    error?: string;
  }
  ```

- Content:

  - Label: `"T-SQL query"`.
  - Large `<textarea>` with monospace font.
  - Optional small helper text: `"Paste a T-SQL query from your reports or stored procedures."`
  - Primary button: `"Generate diagram"`.
    - Disabled when `isLoading` or when `sql.trim().length === 0`.

- Behavior:

  - `onSqlChange` called on textarea change.
  - When button clicked, call `onSubmit`.
  - Show a small error message below if `error` exists.

- Styling: keep it minimal and clean. No UI frameworks.

### 6.4 `DiagramViewer.tsx`

- File: `/src/components/DiagramViewer.tsx`
- Props:

  ```ts
  interface DiagramViewerProps {
    mermaidCode: string;
  }
  ```

- Responsibilities:

  - If `mermaidCode` is empty, display a neutral placeholder text:
    - `"Diagram will appear here once generated."`
  - If `mermaidCode` is non-empty:
    - Use Mermaid JS to render the diagram into a `<div>`.
    - Re-render when `mermaidCode` changes.

- Implementation detail:

  - Initialize Mermaid in a `useEffect` hook.
  - Use a unique ID or ref for the diagram container.
  - Ensure multiple renders do not create duplicates; clear or replace innerHTML before rendering.

### 6.5 `MermaidCodeBlock.tsx`

- File: `/src/components/MermaidCodeBlock.tsx`
- Props:

  ```ts
  interface MermaidCodeBlockProps {
    mermaidCode: string;
  }
  ```

- Responsibilities:

  - Show the Mermaid code in a `<pre><code>` block.
  - If `mermaidCode` is empty, show a placeholder like `"Mermaid code will appear here."`.
  - Include a small `"Copy"` button aligned top-right of the code block:
    - Uses the Clipboard API to copy the code.
    - On success, briefly show `"Copied!"`.

- Styling:

  - Monospace font.
  - Light border and subtle background (like existing Mermaid Exporter style).

---

## 7. Example End-to-End Flow

Input SQL (pasted into `SqlInputForm`):

```sql
SELECT s.Site, COUNT(*) AS VisitCount
FROM EDVisits v
INNER JOIN Sites s ON v.SiteId = s.Id
WHERE v.Acuity IN (1,2,3) AND v.VisitDate >= '2024-01-01'
GROUP BY s.Site;
```

Backend processing:

```ts
const spec: DiagramSpec = {
  tables: [
    { id: "A", name: "EDVisits", alias: "v" },
    { id: "B", name: "Sites", alias: "s" }
  ],
  joins: [
    {
      fromTableId: "A",
      toTableId: "B",
      joinType: "INNER",
      condition: "v.SiteId = s.Id"
    }
  ],
  filters: [
    { id: "F1", tableId: "A", expression: "v.Acuity IN (1,2,3)" },
    { id: "F2", tableId: "A", expression: "v.VisitDate >= '2024-01-01'" }
  ],
  groupBy: ["s.Site"],
  select: ["s.Site", "COUNT(*) AS VisitCount"],
  subqueries: []
};
```

OpenAI response (Mermaid):

```mermaid
flowchart TD
    A[EDVisits v]
    B[Sites s]

    A -->|v.SiteId = s.Id| B

    subgraph Filters_for_EDVisits_v
        F1[v.Acuity IN (1,2,3)]
        F2[v.VisitDate >= '2024-01-01']
    end

    A --> F1
    A --> F2
```

UI behavior:

- Diagram appears in `<DiagramViewer />` on the right.
- Same Mermaid code appears in `<MermaidCodeBlock />` under the diagram.
- Layout looks like the Mermaid Exporter app.

---

## 8. Cloud Run Deployment

Copilot should create a **Dockerfile** at repo root:

- Build Next.js app.
- Start with `npm install`, `npm run build`.
- Use `npm run start` in the final stage.
- Expose port `3000` internally, but Cloud Run will map to `8080` as configured.

Add a short `README` section with:

```bash
npm install
npm run dev   # local development

npm run build
npm run start # local production preview

docker build -t sql-flowchart-visualizer .
docker run -p 3000:3000 sql-flowchart-visualizer
```

Cloud Run will use this container; additional infra config can be added later.

Keep the Dockerfile concise and standard for Next.js.

---

## 9. Clean Code & No Duplication — Explicit Instructions to Copilot

Copilot must:

1. **Avoid duplicate type definitions.**
   - All diagram-related types live in `src/shared/types/diagramSpec.ts`.

2. **Prefer small, single-purpose functions.**
   - `parseSql` only parses.
   - `extractDiagramSpec` only walks AST and builds the spec.
   - `getMermaidFromDiagramSpec` only talks to OpenAI.

3. **Avoid unnecessary abstraction layers.**
   - Do not introduce extra “service” classes or complex patterns.

4. **Keep files short and focused.**
   - Split helpers logically when needed.

5. **Error handling should be simple and user-oriented.**
   - Return small diagrams on error, not stack traces to the client.
   - Log errors on the server console in a minimal, readable way.

6. **No over-engineering.**
   - No Redux.
   - No heavy CSS/UI libraries.
   - A simple Next.js page with three core components is enough.

---

## 10. What Copilot Should Generate Next

When starting from this blueprint, Copilot should:

1. Scaffold the Next.js project structure and basic config files.
2. Implement server logic:
   - `parseSql.ts`
   - `extractDiagramSpec.ts`
   - `openAiClient.ts`
   - `api/sql-to-diagram/route.ts`
3. Implement the UI:
   - `layout.tsx` and `page.tsx`
   - `LayoutShell.tsx`
   - `SqlInputForm.tsx`
   - `DiagramViewer.tsx`
   - `MermaidCodeBlock.tsx`
4. Add a minimal Dockerfile.
5. Add a short `README.md` with setup & run instructions.

All code must be **complete, TypeScript-correct, and ready to paste into the repo** without extra boilerplate.
