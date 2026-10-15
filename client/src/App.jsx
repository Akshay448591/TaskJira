import { Routes, Route } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AppShell from './components/AppShell.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Home from './pages/Home.jsx';
import Profile from './pages/Profile.jsx';
import WorkspaceShell from './pages/WorkspaceShell.jsx';
import ProjectsPage from './pages/ProjectsPage.jsx';
import ProjectPage from './pages/ProjectPage.jsx';
import TasksPage from './pages/TasksPage.jsx';
import TaskPage from './pages/TaskPage.jsx';
import MembersPage from './pages/MembersPage.jsx';
import WorkspaceSettings from './pages/WorkspaceSettings.jsx';
import SearchPage from './pages/SearchPage.jsx';
import ActivityPage from './pages/ActivityPage.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';
import AnalyticsPage from './pages/AnalyticsPage.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route index element={<Home />} />
        <Route path="profile" element={<Profile />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="w/:workspaceId" element={<WorkspaceShell />}>
          <Route index element={<ProjectsPage />} />
          <Route path="projects/:projectId" element={<ProjectPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="task/:taskId" element={<TaskPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="members" element={<MembersPage />} />
          <Route path="settings" element={<WorkspaceSettings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
