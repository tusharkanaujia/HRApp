// Provisions the MBM Gulf tenant in Firestore.
// Run from the hrapp/ directory: node scripts/tenants/mbm.js
// Idempotent: aborts if the tenant already exists.

import { provisionTenant } from "../lib/provisionTenant.js";

const TENANT = {
  id: "mbm",
  name: "MBM Gulf",
  subdomain: "mbm",
  primaryColor: "#0d9488", // teal
  logoUrl: "",
};

const ADMIN_USERS = [
  {
    id: "mbm_u001",
    username: "obaid.syed",
    password: "hr@2024",
    name: "Obaid Syed",
    role: "ADMIN",
  },
];

provisionTenant(TENANT, ADMIN_USERS).catch((err) => {
  console.error("❌  Error:", err.message);
  process.exit(1);
});
