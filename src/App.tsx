import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import EmployeesPage from './pages/EmployeesPage';
import EmployeeDetailPage from './pages/EmployeeDetailPage';
import ProjectsPage from './pages/ProjectsPage';
import OrgChartPage from './pages/OrgChartPage';
import UsersPage from './pages/UsersPage';
import AppearancePage from './pages/AppearancePage';
import ActivityPage from './pages/ActivityPage';
import { TenantProvider, useTenant } from './contexts/TenantContext';
import { setTenantId } from './lib/firestoreSync';
import { subscribeToTenantData } from './lib/firestoreLoader';
import type { AppDispatch } from './store';

function DataLoader({ children }: { children: React.ReactNode }) {
  const dispatch = useDispatch() as AppDispatch;
  const { tenantId, loading: tenantLoading } = useTenant();
  const [dataReady, setDataReady] = useState(false);

  useEffect(() => {
    if (!tenantId || tenantLoading) return;
    setTenantId(tenantId);
    return subscribeToTenantData(tenantId, dispatch, () => setDataReady(true));
  }, [tenantId, tenantLoading, dispatch]);

  if (!dataReady) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Loading WeHive…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function AppShell() {
  const { loading, migrating, error } = useTenant();

  if (migrating) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-lg font-semibold">Setting up WeHive for the first time…</p>
          <p className="text-slate-400 text-sm mt-1">Migrating data to cloud — this takes about 10 seconds</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-center px-4">
        <div>
          <p className="text-red-400 font-semibold mb-1">Connection failed</p>
          <p className="text-slate-400 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <DataLoader>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/"           element={<HomePage />} />
              <Route path="/employees"     element={<EmployeesPage />} />
              <Route path="/employees/:id" element={<EmployeeDetailPage />} />
              <Route path="/projects"   element={<ProjectsPage />} />
              <Route path="/org-chart"  element={<OrgChartPage />} />
              <Route path="/users"      element={<UsersPage />} />
              <Route path="/appearance" element={<AppearancePage />} />
              <Route path="/activity"   element={<ActivityPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </DataLoader>
  );
}

export default function App() {
  return (
    <TenantProvider>
      <AppShell />
    </TenantProvider>
  );
}
