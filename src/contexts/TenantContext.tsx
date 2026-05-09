import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getTenantSlug } from '../lib/tenant';
import { migrateABCToFirestore } from '../lib/seedFirestore';

export interface TenantProfile {
  id: string;
  name: string;
  subdomain: string;
  primaryColor: string;
  logoUrl: string;
}

interface TenantContextValue {
  tenant: TenantProfile | null;
  tenantId: string;
  loading: boolean;
  migrating: boolean;
  error: string | null;
}

const TenantContext = createContext<TenantContextValue>({
  tenant: null,
  tenantId: '',
  loading: true,
  migrating: false,
  error: null,
});

export function TenantProvider({ children }: { children: ReactNode }) {
  const tenantId = getTenantSlug();
  const [tenant, setTenant] = useState<TenantProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const snap = await getDoc(doc(db, 'tenants', tenantId));

        if (!snap.exists()) {
          if (tenantId === 'abc') {
            setMigrating(true);
            await migrateABCToFirestore();
            setMigrating(false);
            const fresh = await getDoc(doc(db, 'tenants', tenantId));
            setTenant(fresh.exists()
              ? { id: tenantId, ...fresh.data() } as TenantProfile
              : { id: tenantId, name: 'WeHive', subdomain: tenantId, primaryColor: '#2563eb', logoUrl: '' },
            );
          } else {
            setTenant({ id: tenantId, name: tenantId, subdomain: tenantId, primaryColor: '#2563eb', logoUrl: '' });
          }
        } else {
          setTenant({ id: tenantId, ...snap.data() } as TenantProfile);
        }
      } catch (err) {
        console.error('Tenant load error:', err);
        setError('Could not connect to database. Check your internet connection.');
      } finally {
        setLoading(false);
        setMigrating(false);
      }
    }
    init();
  }, [tenantId]);

  return (
    <TenantContext.Provider value={{ tenant, tenantId, loading, migrating, error }}>
      {children}
    </TenantContext.Provider>
  );
}

export const useTenant = () => useContext(TenantContext);
