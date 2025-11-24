# logic_update_instructions.md

## Goal
Update the current SQL-to-Mermaid visualization logic for the Cloud Run application so that all structural logic is rendered **inside stage blocks (yellow boxes)** with **no external nodes** and **no external join arrows**.

This specification replaces prior diagram logic. The updated version must support very large T-SQL (1000–1500+ lines) while staying deterministic, readable, and scalable.

---

## Required Behaviors

### 1. One Block per Logical Stage
A *stage* is:
- A CTE (`WITH cte_name AS (...)`)
- A temp table created via `SELECT ... INTO #Temp`
- A temp table filled via `INSERT INTO #Temp SELECT ...`
- The final query (last `SELECT` without INTO)

Each stage must render as a **yellow Mermaid subgraph block**.

---

## 2. All Structural SQL Goes *Inside* the Block
Each block must include, in order:

1. **FROM** items  
2. **JOIN** items with full `JOIN ... ON ...` expressions  
3. **WHERE** conditions (flattened by AND)  
4. **GROUP BY** expressions  
5. **OPTIONAL:** SELECT expressions (config flag; off by default)

This replaces all existing logic that displayed joins or base tables outside the stage.

---

## 3. No External Nodes
Remove:
- External base-table nodes  
- External join-condition arrows  
- External FROM/JOIN boxes  
- Any replication of data sources outside the yellow block

Mermaid output must not render *any* nodes except the stage blocks and their contents.

---

## 4. Vertical Lineage Only
Between stages, draw **only one vertical arrow**:

```
CTE_1 --> CTE_2 --> #TempA --> #TempB --> Final
```

Dependencies are determined by:
- FROM table names matching prior stage names  
- JOIN target names matching prior stage names  
- Temp tables created earlier

The lineage arrow **must not** include join logic.

---

## 5. Deterministic Parsing Rules

Implement the following extractor logic:

### A. FROM Extraction
- Extract every table/subquery expression in `FROM`.
- Use the exact SQL text: `FROM: <table or subquery SQL>`

### B. JOIN Extraction
For each join, generate a line:

```
JOIN: <JOIN_TYPE> <table or subquery> ON <condition SQL>
```

JOIN_TYPE only if present, e.g., `LEFT`, `INNER`, `RIGHT`.

### C. WHERE Extraction
- Flatten via AND.
- Preserve OR groups untouched.
- Output each predicate as:

```
WHERE: <predicate SQL>
```

### D. GROUP BY
Render each expression as:

```
GROUP BY: <group expression>
```

### E. SELECT (optional)
Only if future toggle enables it.

---

## 6. Internal Node Ordering inside the Stage
Inside each block, insert nodes in the following order:

1. All `FROM`
2. All `JOIN`
3. All `WHERE`
4. All `GROUP BY`
5. (optional) SELECT

Internal Mermaid connections should be sequential:

```
FROM_1 --> JOIN_1 --> JOIN_2 --> WHERE_1 --> GROUPBY_1
```

If a category has multiple lines (e.g., multiple WHERE lines), list in natural SQL order.

---

## 7. Do Not Render BASE Tables
If a FROM or JOIN refers to a physical table (not a CTE or temp), **only include the textual line inside the block**. Do not create nodes or arrows representing those tables.

---

## 8. No External Join Arrows
All join-condition arrows previously pointing to base tables must be removed.

Only lineage arrows remain.

---

## 9. Mermaid Output Format
For each stage:

```
subgraph S0["cte_Name (CTE)"]
    direction TB
    N0["FROM: dbo.TableA a"]
    N1["JOIN: LEFT JOIN dbo.TableB b ON a.ID = b.ID"]
    N2["WHERE: a.Date >= '2024-01-01'"]
    N3["GROUP BY: a.SiteID"]
    N0 --> N1 --> N2 --> N3
end
```

Top-level:

```
flowchart TD
S0 --> S1 --> S2 --> S3
```

---

## 10. Replacement of Existing Logic
The existing logic responsible for:
- Base-table external nodes  
- Join-condition external nodes  
- Multi-node join graphs  
- External WHERE blocks  

**must be deleted**, not modified.

Your new code should use stage-only blocks as the final output shape.

---

## 11. Scaling Requirements
The updated implementation must:
- Work for 1500+ line SQL scripts  
- Handle 20–40 stages  
- Remain readable  
- Avoid Mermaid rendering crashes  
- Preserve SQL verbatim inside blocks (escape quotes only)

---

## 12. Minimal, Clean TypeScript Code
Copilot must:
- Avoid duplicate parsing  
- Avoid code repetition  
- Keep extraction functions small and pure  
- Build a clean `DiagramSpec` per stage  
- Build Mermaid text from that spec only  
- Keep `mermaidCode` generation isolated in its own module

---

## 13. Cloud Run Context
The implementation will run server-side on Cloud Run:
- No Jupyter integration  
- No Python  
- Use existing TypeScript environment  
- No external TSX visualization logic, only return Mermaid text

--- 

## 14. Prompt/Parser Flow
Copilot should apply this workflow:

1. `parseSQL(sqlText)` → AST  
2. `identifyStages(ast)`  
3. `extractSpec(stage)` → `{ fromItems, joinItems, whereItems, groupByItems }`  
4. `generateMermaid(specs)` → single string  
5. `respond { mermaidCode: string }`

This is the new authoritative workflow.

---

## 15. Testing Checklist
Copilot must ensure:

- [ ] CTEs produce blocks  
- [ ] Temp tables produce blocks  
- [ ] Final SELECT produces a block  
- [ ] All FROM/JOIN/WHERE/GROUP BY appear inside blocks  
- [ ] No external nodes  
- [ ] No external arrows except stage lineage  
- [ ] Works with 1000+ lines of SQL  
- [ ] Mermaid renders without crashing  
