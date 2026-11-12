# DEPENDENCIES and SECRETS

Every package is code we did not write. Each one needs a reason to be here.
All versions are pinned exactly in `package.json`, and `package-lock.json` is committed.

## Runtime packages (server)
| Package | Why we need it | Maintained by |
|---|---|---|
| express | Web server and routing | OpenJS Foundation |
| express-session | Server-side login sessions | Express team |
| connect-mongo | Stores sessions in MongoDB | jdesboeufs / community |
| mongoose | Talks to MongoDB, with schemas | Automattic / MongoDB community |
| helmet | Safe HTTP headers (CSP, HSTS, …) | helmetjs |
| express-rate-limit | Slows down brute force and abuse | express-rate-limit team |
| pino, pino-http | Fast structured logs with redaction | pino team |
| zod | Validates every input | colinhacks |
| luxon | Timezone-safe date maths | Moment team |
| google-auth-library | Google sign-in (OAuth) and token checks | Google |
| @googleapis/calendar | Google Calendar API client | Google |
| @anthropic-ai/sdk | Optional AI talking points | Anthropic |
| libphonenumber-js | Checks phone numbers and formats them as +91… | catamphetamine (port of Google's libphonenumber) |

## Runtime packages (web)
| Package | Why | Maintained by |
|---|---|---|
| react, react-dom | The dashboard UI | Meta |
| zod, libphonenumber-js | Same input rules as the server, for friendly errors | see above |

## Development-only packages
| Package | Why |
|---|---|
| typescript | Type checking (kept on 6.0.x because typescript-eslint does not support 7 yet) |
| eslint, @eslint/js, typescript-eslint, eslint-plugin-react-hooks, globals | Linting |
| vitest | Tests |
| supertest | API tests over HTTP |
| mongodb-memory-server | A throwaway MongoDB for tests and demo mode |
| @testing-library/react, jest-dom, user-event, jsdom | React screen tests |
| vite, @vitejs/plugin-react | Builds the React app |
| esbuild | Bundles the server for production |
| tsx | Runs TypeScript directly while developing |
| @types/* | Type definitions |

## Secrets we handle
| Secret | Where it lives | Who can read it | What happens if it leaks |
|---|---|---|---|
| `GOOGLE_CLIENT_SECRET` | Render env vars, local `.env` | Server only | Someone could pretend to be the app on Google's login page. Rotate it in Google Cloud. |
| `SESSION_SECRET` | Render env vars, local `.env` | Server only | Session cookies could be forged. Rotate it: everyone gets logged out. |
| `TOKEN_ENCRYPTION_KEY` | Render env vars, local `.env` | Server only | With a database copy, someone could decrypt tokens, phones and notes. Rotate both the key and the Google token. |
| `CRON_SECRET` | Render env vars + GitHub Actions secret | Server and the hourly workflow | Someone could trigger the job early. It still obeys every rule. Rotate it. |
| `MONGODB_URI` | Render env vars, local `.env` | Server only | Database access. Rotate the Atlas password. |
| `ANTHROPIC_API_KEY` (optional) | Render env vars, local `.env` | Server only | Someone could spend my API credit. Revoke it in the Anthropic console. |
| Google refresh token | MongoDB, encrypted | Server only, never the browser | Calendar access. Revoke it at myaccount.google.com/permissions. |

Before every commit: scan the diff for keys, tokens and `.env` contents.
