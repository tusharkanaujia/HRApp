# Per-tenant assets

Each tenant gets its own folder here for static assets served at `/tenants/<slug>/...`.

## Logo

Drop a square PNG at `public/tenants/<slug>/logo.png` and it will appear automatically on the login page and sidebar for that tenant. Recommended:

- **File:** `logo.png`
- **Size:** 256x256 px (square; will be displayed at 36–56px)
- **Background:** transparent

If `logo.png` is missing, the app falls back to the tenant's initials on a colored badge (the `primaryColor` from the Firestore tenant doc).

## Current tenants

- `abc/` — Ancient Builders Constructions LLC
- `mbm/` — MBM Gulf
- `test/` — Test Company

## Adding a logo to an existing tenant

1. Save the logo as `public/tenants/<slug>/logo.png`
2. Run `npm run build`
3. `firebase deploy --only hosting`
4. Hard-refresh the browser (Ctrl+Shift+R) to bypass the CDN cache
