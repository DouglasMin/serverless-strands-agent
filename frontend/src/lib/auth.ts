/**
 * Cognito hosted-UI sign-in via OAuth 2.0 authorization code + PKCE.
 *
 * The pool federates to Google only, so `identity_provider=Google` sends users
 * straight to Google and the Cognito chooser page is never rendered.
 *
 * Tokens live in localStorage rather than memory for two reasons: the session
 * must survive a reload, and the 3LO popup at /auth/callback is a separate
 * document that needs the same ID token to call /api/auth/complete.
 */

const DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN ?? "";
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID ?? "";

const TOKENS_KEY = "serverlessstrands:tokens";
const VERIFIER_KEY = "serverlessstrands:pkceVerifier";

// Refresh this far before actual expiry so an in-flight request never races it.
const REFRESH_MARGIN_MS = 60_000;

export interface AuthUser {
  userId: string;
  email?: string;
}

interface StoredTokens {
  idToken: string;
  refreshToken?: string;
  expiresAt: number;
}

export const isAuthConfigured = (): boolean =>
  DOMAIN.length > 0 && CLIENT_ID.length > 0;

const redirectUri = (): string => `${window.location.origin}/`;

/* ─── storage ────────────────────────────────────────────── */

function readTokens(): StoredTokens | null {
  try {
    const raw = localStorage.getItem(TOKENS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredTokens;
    return parsed?.idToken ? parsed : null;
  } catch {
    return null;
  }
}

function writeTokens(tokens: StoredTokens): void {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
}

function clearTokens(): void {
  localStorage.removeItem(TOKENS_KEY);
}

/* ─── PKCE helpers ───────────────────────────────────────── */

function base64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomVerifier(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(48)));
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  return base64Url(digest);
}

/** Decodes a JWT payload. Signature is NOT checked — the Lambda does that. */
function decodeClaims(jwt: string): Record<string, unknown> | null {
  try {
    const payload = jwt.split(".")[1];
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/* ─── sign in / out ──────────────────────────────────────── */

export async function signIn(): Promise<void> {
  const verifier = randomVerifier();
  sessionStorage.setItem(VERIFIER_KEY, verifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    scope: "openid email profile",
    identity_provider: "Google",
    code_challenge: await challengeFor(verifier),
    code_challenge_method: "S256"
  });

  window.location.assign(`https://${DOMAIN}/oauth2/authorize?${params}`);
}

export function signOut(): void {
  clearTokens();
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    logout_uri: redirectUri()
  });
  window.location.assign(`https://${DOMAIN}/logout?${params}`);
}

/* ─── redirect callback ──────────────────────────────────── */

function storeTokenResponse(payload: Record<string, unknown>): void {
  const idToken = payload.id_token as string | undefined;
  if (!idToken) throw new Error("token response missing id_token");

  const expiresIn = Number(payload.expires_in ?? 3600);
  writeTokens({
    idToken,
    // A refresh grant does not return a new refresh_token; keep the old one.
    refreshToken:
      (payload.refresh_token as string | undefined) ??
      readTokens()?.refreshToken,
    expiresAt: Date.now() + expiresIn * 1000
  });
}

/**
 * Consumes `?code=` if the browser just came back from Cognito.
 * Returns true when a sign-in was completed on this load.
 */
export async function completeSignIn(): Promise<boolean> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if (!code) return false;

  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);

  // Strip the code from the address bar before any await, so a reload
  // mid-exchange cannot replay an already-consumed code.
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  window.history.replaceState({}, "", url.toString());

  if (!verifier) throw new Error("missing PKCE verifier — restart sign-in");

  const res = await fetch(`https://${DOMAIN}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier
    })
  });

  if (!res.ok) throw new Error(`token exchange failed: HTTP ${res.status}`);
  storeTokenResponse(await res.json());
  return true;
}

/* ─── token access ───────────────────────────────────────── */

// Shared so concurrent API calls trigger exactly one refresh.
let refreshInFlight: Promise<string | null> | null = null;

async function refresh(refreshToken: string): Promise<string | null> {
  const res = await fetch(`https://${DOMAIN}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      refresh_token: refreshToken
    })
  });

  if (!res.ok) {
    // Refresh token revoked or expired — the only way forward is a new sign-in.
    clearTokens();
    return null;
  }

  storeTokenResponse(await res.json());
  return readTokens()?.idToken ?? null;
}

/** Valid ID token, refreshed on demand, or null if the user must sign in. */
export async function getIdToken(): Promise<string | null> {
  const tokens = readTokens();
  if (!tokens) return null;

  if (Date.now() < tokens.expiresAt - REFRESH_MARGIN_MS) return tokens.idToken;
  if (!tokens.refreshToken) {
    clearTokens();
    return null;
  }

  if (!refreshInFlight) {
    refreshInFlight = refresh(tokens.refreshToken).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/** Current user from the cached token, without a network call. */
export function currentUser(): AuthUser | null {
  const tokens = readTokens();
  if (!tokens) return null;
  const claims = decodeClaims(tokens.idToken);
  const sub = claims?.sub;
  if (typeof sub !== "string") return null;
  const email = claims?.email;
  return { userId: sub, email: typeof email === "string" ? email : undefined };
}
