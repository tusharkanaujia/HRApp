// Provisions the Test Company tenant in Firestore.
// Run from the hrapp/ directory: node scripts/tenants/test.js
// Idempotent: aborts if the tenant already exists.

import { provisionTenant } from "../lib/provisionTenant.js";

const TENANT = {
  id: "test",
  name: "Test Company",
  subdomain: "test",
  primaryColor: "#7c3aed", // purple
  logoUrl: "",
};

const ADMIN_USERS = [
  {
    id: "test_u001",
    username: "test.admin",
    password: "test@2026",
    name: "Test Admin",
    role: "ADMIN",
  },
];

provisionTenant(TENANT, ADMIN_USERS).catch((err) => {
  console.error("❌  Error:", err.message);
  process.exit(1);
});
