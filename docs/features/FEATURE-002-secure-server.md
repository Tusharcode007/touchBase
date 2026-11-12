# FEATURE-002: Secure server and Google sign-in

**Goal:** A server that only the owner can use, that keeps personal data encrypted, and that is safe against common web attacks.

**Scope:** startup checks (env.ts), encryption (crypto.ts), sessions, CSRF, rate limits, security headers, safe logging, Google sign-in with PKCE, people / settings / call-history / overview routes.

**Design:** see [FLOW.md](../FLOW.md) "Sign in" and [THREAT.md](../THREAT.md).

**Status:** Done.

## Log
- 2026-11-12: Built the server and API tests (81 tests in total, all passing).
- 2026-11-12: The first test run hit `429 Too Many Requests`, which proved the login rate limit works but was too strict for `/api/auth/me` (called on every page load). Moved the strict limit to the login routes only and added a dedicated rate-limit test.
