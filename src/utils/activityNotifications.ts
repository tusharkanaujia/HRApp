// Per-user localStorage helpers for activity notifications + unread counter.

const TOAST_KEY  = (userId: string) => `wehive:toast-enabled:${userId}`;
const SEEN_KEY   = (userId: string) => `wehive:activity-last-seen:${userId}`;

export function getToastEnabled(userId: string): boolean {
  try {
    const v = localStorage.getItem(TOAST_KEY(userId));
    return v == null ? true : v === '1'; // default ON
  } catch { return true; }
}

export function setToastEnabled(userId: string, enabled: boolean): void {
  try { localStorage.setItem(TOAST_KEY(userId), enabled ? '1' : '0'); } catch { /* ignore */ }
}

export function getLastSeenActivityTs(userId: string): string {
  try { return localStorage.getItem(SEEN_KEY(userId)) ?? ''; } catch { return ''; }
}

export function setLastSeenActivityTs(userId: string, iso: string): void {
  try { localStorage.setItem(SEEN_KEY(userId), iso); } catch { /* ignore */ }
}
