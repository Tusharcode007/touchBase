// Structured logs. Redaction is a safety net: we also try never to put
// personal data into log calls in the first place.
import { pino, type Logger } from "pino";

export function createLogger(level: string): Logger {
  return pino({
    level,
    redact: {
      paths: [
        "*.phone",
        "*.phoneE164",
        "*.notes",
        "*.name",
        "*.email",
        "*.refreshToken",
        "*.accessToken",
        "*.token",
        "*.code",
        "req.headers.cookie",
        "req.headers.authorization",
        "headers.cookie",
        "headers.authorization",
      ],
      censor: "[hidden]",
    },
  });
}
