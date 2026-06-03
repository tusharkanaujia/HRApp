import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import ActivityToastBridge from './ActivityToastBridge';

export default function Layout() {
  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-slate-50">
        <Outlet />
      </main>
      <ActivityToastBridge />
    </div>
  );
}
