import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Outlet, Navigate } from 'react-router-dom';
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
import { AuthProvider, useAuthContext } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { useAuth } from './hooks/useAuth';
import { setTenantId } from './lib/firestoreSync';
import { subscribeToTenantData } from './lib/firestoreLoader';
import type { AppDispatch } from './store';

// Subscribes to tenant data once the user is authenticated, then renders the
// protected app. Also enforces account validity: a signed-in user whose
// directory entry is missing or disabled is signed straight back out.
function DataLoaderGate() {
  const dispatch = useDispatch() as AppDispatch;
  const { tenantId } = useTenant();
  const { firebaseUser, signOutUser } = useAuthContext();
  const { currentUser } = useAuth();
  const [dataReady, setDataReady] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    setTenantId(tenantId);
    return subscribeToTenantData(tenantId, dispatch, () => setDataReady(true));
  }, [tenantId, dispatch]);

  // Once the directory has loaded, reject removed/disabled accounts.
  useEffect(() => {
    if (dataReady && firebaseUser && (!currentUser || currentUser.disabled)) {
      signOutUser();
    }
  }, [dataReady, firebaseUser, currentUser, signOutUser]);

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

  return <Outlet />;
}

function AppShell() {
  const { loading, migrating, error } = useTenant();
  const { authLoading } = useAuthContext();

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

  if (loading || authLoading) {
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
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* Authenticated branch — data is only fetched after sign-in. */}
          <Route element={<ProtectedRoute />}>
            <Route element={<DataLoaderGate />}>
              <Route element={<Layout />}>
                <Route path="/"              element={<HomePage />} />
                <Route path="/employees"     element={<EmployeesPage />} />
                <Route path="/employees/:id" element={<EmployeeDetailPage />} />
                <Route path="/projects"      element={<ProjectsPage />} />
                <Route path="/org-chart"     element={<OrgChartPage />} />
                <Route path="/users"         element={<UsersPage />} />
                <Route path="/appearance"    element={<AppearancePage />} />
                <Route path="/activity"      element={<ActivityPage />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <TenantProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </TenantProvider>
  );
}
