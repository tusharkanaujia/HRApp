// Maps app usernames to per-tenant synthetic emails for Firebase Auth.
// The tenant is encoded in the email domain (`<username>@<tenantId>.wehive.app`)
// so Firestore rules can enforce per-tenant isolation from the email alone.
// This is the single source of truth for that mapping — reused by the login
// flow, the migration script, and admin user-creation.
export const AUTH_EMAIL_DOMAIN = 'wehive.app';

export function toAuthEmail(username: string, tenantId: string): string {
  return `${username.trim().toLowerCase()}@${tenantId}.${AUTH_EMAIL_DOMAIN}`;
}

export function usernameFromEmail(email: string | null | undefined): string {
  return email ? email.split('@')[0] : '';
}
