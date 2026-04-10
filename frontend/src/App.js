import React, { useState, useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { WebSocketProvider } from "./contexts/WebSocketContext";
import { Toaster } from "sonner";
import LandingPage from "./pages/LandingPage";
import AuthPage from "./pages/AuthPage";
import CrewDashboard from "./pages/CrewDashboard";
import ContractorDashboard from "./pages/ContractorDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import ProfilePage from "./pages/ProfilePage";
import SubscriptionPage from "./pages/SubscriptionPage";
import AppSettingsPage from "./pages/AppSettingsPage";
import ArchivePage from "./pages/ArchivePage";
import CmsPage from "./pages/CmsPage";
import PayHistoryPage from "./pages/PayHistoryPage";
import MessagesPage from "./pages/MessagesPage";
import OnboardingModal from "./components/OnboardingModal";

const ONBOARDING_KEY = "punchlistjobs_onboarding_done";

function OnboardingGate({ children }) {
  const { user } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!user || user.role === "admin" || user.role === "superadmin") return;
    const done = localStorage.getItem(ONBOARDING_KEY);
    if (done) return;
    const hasPhoto = !!(user.profile_photo || user.logo);
    const hasPhone = !!user.phone;
    const hasAddress = !!user.address;
    const hasSkills = !!(user.skills?.length > 0 || user.trade);
    const hasBio = !!user.bio;
    const isComplete = hasPhoto && hasPhone && hasAddress && hasSkills && hasBio;
    if (!isComplete) setShowOnboarding(true);
  }, [user]);

  return (
    <>
      {children}
      {showOnboarding && (
        <OnboardingModal onClose={() => { setShowOnboarding(false); localStorage.setItem(ONBOARDING_KEY, "true"); }} />
      )}
    </>
  );
}

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-[#050A30] flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7EC8E3]" />
    </div>
  );
  if (!user) return <Navigate to="/auth" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function DashboardRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/auth" replace />;
  if (user.role === "crew") return <Navigate to="/crew/dashboard" replace />;
  if (user.role === "contractor") return <Navigate to="/contractor/dashboard" replace />;
  if (user.role === "admin" || user.role === "superadmin") return <Navigate to="/admin/dashboard" replace />;
  return <Navigate to="/" replace />;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/" element={user ? <DashboardRedirect /> : <LandingPage />} />
      <Route path="/auth" element={user ? <DashboardRedirect /> : <AuthPage />} />
      <Route path="/crew/dashboard" element={
        <ProtectedRoute roles={["crew"]}><OnboardingGate><CrewDashboard /></OnboardingGate></ProtectedRoute>
      } />
      <Route path="/contractor/dashboard" element={
        <ProtectedRoute roles={["contractor"]}><OnboardingGate><ContractorDashboard /></OnboardingGate></ProtectedRoute>
      } />
      <Route path="/admin/dashboard" element={
        <ProtectedRoute roles={["admin", "superadmin"]}><AdminDashboard /></ProtectedRoute>
      } />
      <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/profile/:userId" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/subscription" element={<ProtectedRoute><SubscriptionPage /></ProtectedRoute>} />
      <Route path="/pay-history" element={<ProtectedRoute><PayHistoryPage /></ProtectedRoute>} />
      <Route path="/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
      <Route path="/archive" element={<ProtectedRoute roles={["contractor","admin","superadmin"]}><ArchivePage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><AppSettingsPage /></ProtectedRoute>} />
      <Route path="/pages/:slug" element={<CmsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <WebSocketProvider>
            <AppRoutes />
            <Toaster position="top-right" richColors />
          </WebSocketProvider>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
