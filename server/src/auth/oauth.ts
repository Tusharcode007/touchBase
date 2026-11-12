// "Sign in with Google" using the OAuth 2.0 authorization-code flow + PKCE.
//
// Why the server does this (not the browser): the client secret and the
// refresh token must never reach the browser.
//
// This is behind an interface so tests can swap in a fake Google.
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import type { Env } from "../config/env.js";
import { HttpError } from "../lib/errors.js";

/** The narrowest scopes that do the job (see docs/DECISIONS.md D-012). */
export const SCOPES = [
  "openid",
  "email",
  "profile",
  // Create/move/delete events, but only on calendars I own.
  "https://www.googleapis.com/auth/calendar.events.owned",
  // Read event times to find busy time (titles are never stored).
  "https://www.googleapis.com/auth/calendar.events.readonly",
  // List my calendars so I can choose which ones to check.
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];

const REQUIRED_CALENDAR_SCOPES = SCOPES.filter((s) => s.startsWith("https://"));

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  refreshToken: string | null;
}

export interface OAuthService {
  authUrl(state: string, codeChallenge: string): string;
  exchange(code: string, codeVerifier: string): Promise<GoogleIdentity>;
  revoke(refreshToken: string): Promise<void>;
  /** An authorised client for calling Google APIs on the user's behalf. */
  clientFor(refreshToken: string): OAuth2Client;
}

const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

export function googleOAuth(env: Env): OAuthService {
  const redirectUri = `${env.appUrl}/api/auth/google/callback`;
  const newClient = () =>
    new OAuth2Client({ clientId: env.googleClientId, clientSecret: env.googleClientSecret, redirectUri });

  return {
    authUrl(state, codeChallenge) {
      return newClient().generateAuthUrl({
        access_type: "offline", // we need a refresh token for the daily job
        prompt: "consent", // makes Google return the refresh token every time
        scope: SCOPES,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: CodeChallengeMethod.S256,
      });
    },

    async exchange(code, codeVerifier) {
      const client = newClient();
      const { tokens } = await client.getToken({ code, codeVerifier });
      if (!tokens.id_token) throw new HttpError(400, "Google did not return an ID token");

      // verifyIdToken checks the signature, the audience and the expiry.
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: env.googleClientId });
      const payload = ticket.getPayload();
      if (!payload || !payload.email || !payload.sub) throw new HttpError(400, "Google did not return an email");
      if (!payload.iss || !GOOGLE_ISSUERS.has(payload.iss)) throw new HttpError(400, "Wrong token issuer");

      const granted = new Set((tokens.scope ?? "").split(" "));
      if (!REQUIRED_CALENDAR_SCOPES.every((s) => granted.has(s))) {
        throw new HttpError(400, "calendar-permission-missing");
      }

      return {
        sub: payload.sub,
        email: payload.email.toLowerCase(),
        emailVerified: payload.email_verified === true,
        name: payload.name ?? "",
        refreshToken: tokens.refresh_token ?? null,
      };
    },

    async revoke(refreshToken) {
      await newClient().revokeToken(refreshToken);
    },

    clientFor(refreshToken) {
      const client = newClient();
      client.setCredentials({ refresh_token: refreshToken });
      return client;
    },
  };
}
