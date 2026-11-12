# Security

## Reporting a problem

If you find a security issue, please **do not open a public issue**.
Use GitHub's private report instead: **Security → Report a vulnerability** on this repository.

Please include:
- what you found and where (file, route, or screen),
- steps to reproduce it,
- what an attacker could do with it.

You should get a reply within 7 days. Thank you for helping keep people's data safe.

## What touchbase does to stay safe (short version)

- Only the emails on `ALLOWED_EMAILS` can sign in.
- Google sign-in uses the authorization-code flow with PKCE and a one-time `state` value.
- Google tokens, phone numbers and notes are encrypted in the database (AES-256-GCM).
- Sessions live on the server. The cookie is `HttpOnly`, `Secure` (in production) and `SameSite=Lax`, with a 12-hour idle and 7-day absolute limit.
- Every change request needs a CSRF token and must come from the app's own origin.
- Strict Content-Security-Policy, HSTS, rate limits, request size limits, and zod validation on every input.
- Logs never contain tokens, phone numbers, notes or names.
- The server refuses to start with weak secrets, or in demo mode in production.

The full threat model is in [docs/THREAT.md](docs/THREAT.md).
