import { Outlet } from 'react-router-dom';

// The workspace chrome (sidebar, top bar, data loading, shortcuts) now lives in AppShell, so every page shares one layout.
export default function WorkspaceShell() {
  return <Outlet />;
}
