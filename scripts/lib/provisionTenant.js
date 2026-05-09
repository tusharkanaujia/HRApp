// Idempotent tenant provisioning: creates the tenant profile and admin users.
// Used by per-tenant scripts in scripts/tenants/.

import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "./firebase.js";

export async function provisionTenant(tenant, adminUsers) {
  const tenantRef = doc(db, "tenants", tenant.id);
  const existing = await getDoc(tenantRef);
  if (existing.exists()) {
    console.log(
      `⚠️  Tenant "${tenant.id}" already exists — aborting to avoid overwrite.`,
    );
    process.exit(0);
  }

  await setDoc(tenantRef, {
    name: tenant.name,
    subdomain: tenant.subdomain,
    primaryColor: tenant.primaryColor,
    logoUrl: tenant.logoUrl ?? "",
    createdAt: new Date().toISOString(),
  });
  console.log(`✓  Tenant profile created: ${tenant.name}`);

  for (const user of adminUsers) {
    await setDoc(doc(db, "tenants", tenant.id, "users", user.id), { ...user });
    console.log(`✓  User created: ${user.username} (${user.role})`);
  }

  console.log(`\n✅  Done! Tenant "${tenant.id}" is ready.`);
  console.log(
    `   App URL (local):  http://localhost:5176  (set VITE_TENANT_SLUG=${tenant.subdomain})`,
  );
  console.log(
    `   App URL (live):   https://${tenant.subdomain}.wehive.co.uk`,
  );
  process.exit(0);
}
