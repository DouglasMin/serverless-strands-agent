const KEY = "serverlessstrands:userId";

/**
 * Persistent anonymous user id. Survives sessions, scoped to this browser.
 * When real auth lands later, swap this for the authenticated user's sub —
 * nothing else in the app touches user identity.
 */
export function getUserId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
