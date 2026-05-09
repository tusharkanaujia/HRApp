export function getTenantSlug(): string {
  const hostname = window.location.hostname;

  // Local dev — use env override or default to 'abc'
  if (hostname === 'localhost' || hostname.startsWith('127.') || hostname.startsWith('192.168.')) {
    return (import.meta.env.VITE_TENANT_SLUG as string | undefined) ?? 'abc';
  }

  // abc.wehive.co.uk → ['abc','wehive','co','uk'] → 4 parts → return 'abc'
  // wehive.co.uk     → ['wehive','co','uk']        → 3 parts → return 'admin'
  const parts = hostname.split('.');
  return parts.length >= 4 ? parts[0] : 'admin';
}
