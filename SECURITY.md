# Security Policy for the SQL-to-Mermaid Diagram Application

## 1. Overview

This document defines the security requirements and controls for the **SQL-to-Mermaid Diagram Application** deployed on **Google Cloud Run**.

The application:
- Accepts **T-SQL (SQL Server) scripts** as input.
- Parses them and generates **Mermaid diagrams** that show structural blocks (CTEs, temp tables, final query) with FROM/JOIN/WHERE/GROUP BY content.
- Optionally calls an LLM (OpenAI) **only on diagram specs**, not on raw SQL text, where configured.

The primary goals are:
- Protect potentially sensitive SQL logic and metadata.
- Prevent leakage of confidential schema or business logic.
- Ensure safe and controlled use of external LLM APIs.
- Provide a minimal attack surface.

---

## 2. Data Classification and Scope

### 2.1 Input Data

Input is **T-SQL text**, which can contain:
- Internal schema names (table, view, column names).
- Business rules encoded in WHERE/JOIN/GROUP BY logic.
- Potentially PHI-related context (e.g., table names like `Patient`, `Visit`, etc.), although **no raw patient values** should be submitted.

Treat all SQL input as **Confidential / Internal**.

### 2.2 Output Data

Outputs:
- **Mermaid code** representing structural blocks and logic.
- Optional intermediate **diagram specifications** (JSON-like structures, not persisted unless explicitly configured).

Output must be considered the same classification as input: **Confidential / Internal**.

### 2.3 Out-of-Scope Data

The app **must not**:
- Accept or process raw data rows (patient names, IDs, addresses, etc.).
- Connect directly to production databases.
- Execute SQL against any database.

It is strictly a **static analysis / visualization** tool.

---

## 3. Authentication and Authorization

### 3.1 Authentication

- Require authenticated access to the Cloud Run service:
  - Use **Google Identity-Aware Proxy (IAP)** or similar mechanism.
  - Alternatively, restrict to **internal users** via organization-bound IAM and a private ingress configuration.

### 3.2 Authorization

- Only authorized analysts / engineers may use the app.
- Enforce **least privilege**:
  - Cloud Run invocation allowed only to specific groups / service accounts.
- If multi-tenant usage is added:
  - Implement tenant-aware access control and isolation of logs and stored configs.

No anonymous/public access.

---

## 4. Network Security

- Deploy Cloud Run service as:
  - **Internal-only** (VPC-only / private ingress) if possible.
  - Or public only behind IAP with organization-controlled access.
- Ensure HTTPS is enforced for all external access.
- Disallow HTTP (unencrypted) endpoints.
- Use firewall / security policies to limit access to:
  - Only required IP ranges (VPN, corporate network) if feasible.

---

## 5. Handling of SQL Input

### 5.1 No Execution

- **Never execute** submitted SQL against any database.
- Parser must run in **pure AST / static-analysis mode**.
- Do not connect to SQL Server instances or accept connection strings.

### 5.2 Size and Complexity Limits

- Set a **maximum input size** to mitigate abuse:
  - e.g., max 200 KB of SQL text per request.
- Reject excessively large or repeated requests with a clear error message.

### 5.3 Injection / Code Execution

- Treat SQL strictly as text.
- Avoid passing raw SQL into:
  - Shell commands.
  - Dynamic eval or template engines.
- Only pass SQL to the parser (or tokenizer) which expects text input.

---

## 6. LLM / External API Usage

### 6.1 Principle: No Raw SQL to LLM

- If using OpenAI or any external LLM, **do not send raw SQL**.
- Only send **diagram specs** (tables/joins/filters summarized) or other **derived structures** if needed.
- Keep prompts free of identifiable schema names where possible (optional redaction phase).

### 6.2 Secrets Management

- Store `OPENAI_API_KEY` (and any other secrets) in:
  - **Google Secret Manager** or
  - Cloud Run environment variables configured through a secure CI/CD process.
- Never hard-code secrets in:
  - Source files.
  - Git repositories.
  - Docker images.

### 6.3 Transport and Scope

- Use HTTPS/TLS for all calls to OpenAI.
- Apply **rate limiting** to LLM calls to prevent abuse.
- Ensure request payloads contain **no PHI** and no sensitive literal values.

### 6.4 Logging and Retention

- Do not log **LLM payloads** that contain any portion of the diagram spec if it can leak schema logic.
- If logging of prompts/responses is needed:
  - Mask table and column names.
  - Truncate long payloads.
  - Make logging configurable and default it to **minimal**.

---

## 7. Logging and Monitoring

### 7.1 Application Logs

- Log:
  - Request metadata (timestamp, user identity, approximate input size).
  - Errors and stack traces (with sensitive payloads removed).
  - Metrics on number of requests and success/failure status.

Do **not** log:
- Full SQL text.
- Full diagram specs.
- LLM prompts or responses that reveal schema.

### 7.2 Audit Logging

- Enable **Cloud Audit Logs** for:
  - Cloud Run invocations.
  - Secret Manager access.
- Periodically review access patterns for anomalies.

### 7.3 Alerting

- Configure alerts for:
  - Unusual spike in requests or errors.
  - Abnormal outbound volume to OpenAI endpoints.
  - Unauthorized attempts to invoke the service.

---

## 8. Data Storage and Persistence

### 8.1 No Persistent Storage by Default

- By default, do **not** persist:
  - SQL inputs.
  - Diagram specs.
  - Mermaid output.

Treat the service as **stateless** with per-request in-memory processing.

### 8.2 Optional Storage (If Later Enabled)

If future requirements add persistence (e.g., saving diagrams):

- Use a secure, access-controlled storage backend (e.g., Cloud Storage with IAM).
- Encrypt data at rest (GCS default).
- Store only:
  - Hashed user ID or pseudonymous identifier.
  - Sanitized version of the diagram (avoid raw SQL).
- Implement per-user access control for saved artifacts.

---

## 9. Dependency and Supply Chain Security

- Pin critical dependencies (parser, HTTP client) to specific versions in `package.json`.
- Use:
  - `npm audit` or equivalent to monitor vulnerabilities.
  - A regular dependency update process with testing.
- Avoid untrusted or exotic parsing libraries.
- Keep the base Docker image up to date with security patches.

---

## 10. Container and Runtime Security

- Use a minimal, maintained base image (e.g., `gcr.io/distroless/nodejs` or similar).
- Run as **non-root** user in the container.
- Do not mount unnecessary volumes.
- Restrict outbound network access where possible:
  - Allow only required endpoints (OpenAI, logging, metrics).
- Use Cloud Run’s built-in sandboxing and resource limits to reduce impact of compromise.

---

## 11. Configuration Management

- All configuration (API keys, flags, feature toggles) must be:
  - Managed via environment variables or config files injected at runtime.
  - Stored outside the code repository.
- Use CI/CD pipelines (e.g., GitHub Actions) with:
  - Protected branches.
  - Required reviews.
  - Secrets stored in GitHub/Cloud secrets, not in code.

---

## 12. User Interface and Error Handling

- Avoid returning stack traces or internal error details to the client.
- For parsing or LLM failures, return:
  - Generic messages like “Unable to parse SQL / generate diagram.”
- Ensure errors do not leak:
  - Internal SQL fragments.
  - Node IDs.
  - Infrastructure details.

---

## 13. Performance and Abuse Protection

- Apply **rate limiting** at the HTTP/API layer to prevent:
  - Brute-force attempts.
  - Denial-of-service via huge volumes of requests.
- Set **request timeouts** and **maximum body size** for SQL inputs.
- Reject requests that exceed safe limits with HTTP 4xx responses.

---

## 14. Privacy Considerations

- Do not collect personal data beyond:
  - Authentication identity (email/user ID) required for access control.
- Do not store raw SQL or diagrams under user identifiers unless explicitly justified and documented.
- Document to internal users that:
  - No live data is processed.
  - Only SQL logic is used for visualization.
  - They must not paste actual patient identifiers or values.

---

## 15. Review and Maintenance

- Review this security policy at least **annually**, or when:
  - Major new features are added (e.g., diagram persistence).
  - New dependencies are introduced (e.g., new LLM providers).
- Ensure threat modeling is revisited when:
  - Connecting to other internal systems.
  - Enabling cross-project integrations.
- Keep a short **CHANGELOG** section in this document for major security-relevant changes.

---

## 16. Summary of Key Rules

1. **No SQL execution** – static parsing only.  
2. **No raw SQL to LLMs** – only derived, minimized structures.  
3. **No external base-table or join nodes** – structural info lives inside blocks only.  
4. **No persistence by default** – stateless, per-request processing.  
5. **Authentication required** – no anonymous use.  
6. **Secrets in Secret Manager / env vars**, never in code.  
7. **Minimal logging** – no SQL text or schema in logs.  
8. **Enforce size, rate, and timeout limits** to prevent abuse.  

These controls together are intended to make the SQL-to-Mermaid diagram app safe and appropriate for internal analytics engineering use in sensitive environments.
