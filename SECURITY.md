# Security

RequestTrail is a **local teaching demo**. It does not open network sockets between real services.

## Secrets handling

- Structured log redaction masks `Authorization`, `Cookie`, `Set-Cookie`, and common token field names before display.
- Redaction is for demonstration — do not treat it as a production logging filter.
- Never paste real production credentials into the demo fields.

## Scope

- No authentication server is started.
- Correlation IDs are generated in-process with `crypto.randomUUID()` (or a deterministic fallback in tests).
- Logs are held in memory for the UI session only.

## Reporting

If you find an issue in this demo that could mislead people into shipping unsafe logging practices, open an issue or contact the author.
