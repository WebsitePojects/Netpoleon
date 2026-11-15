import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { leftOnPurpose, useAuth } from './auth/auth.js';
import { Shell } from './components/Shell.js';
import { Alerts } from './pages/Alerts.js';
import { Borrow } from './pages/Borrow.js';
import { Dashboard } from './pages/Dashboard.js';
import { Help } from './pages/Help.js';
import { Inspection } from './pages/Inspection.js';
import { Labels } from './pages/Labels.js';
import { ForgotPassword, Login } from './pages/Login.js';
import { NotFound } from './pages/NotFound.js';
import { PartnerDetail, Partners } from './pages/Partners.js';
import { Profile } from './pages/Profile.js';
import { Reports } from './pages/Reports.js';
import { AcceptInvite, ResetPassword } from './pages/SetPassword.js';
import { Settings } from './pages/Settings.js';
import { TransactionDetail } from './pages/TransactionDetail.js';
import { UnitDetail } from './pages/UnitDetail.js';
import { Units } from './pages/Units.js';
import { Users } from './pages/Users.js';

/** Sends a signed-out visitor to sign in, remembering the page they asked for. */
function Protected() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    const from = leftOnPurpose() ? '/' : location.pathname + location.search;
    return <Navigate to="/login" replace state={{ from }} />;
  }
  return <Shell />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password/:token" element={<ResetPassword />} />
      <Route path="/accept-invite/:token" element={<AcceptInvite />} />
      <Route element={<Protected />}>
        <Route index element={<Dashboard />} />
        <Route path="units" element={<Units />} />
        <Route path="units/labels" element={<Labels />} />
        <Route path="units/:code" element={<UnitDetail />} />
        <Route path="borrow" element={<Borrow />} />
        <Route path="borrow/:number" element={<TransactionDetail />} />
        <Route path="inspection" element={<Inspection />} />
        <Route path="reports" element={<Reports />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="users" element={<Users />} />
        <Route path="partners" element={<Partners />} />
        <Route path="partners/:id" element={<PartnerDetail />} />
        <Route path="help" element={<Help />} />
        <Route path="settings" element={<Settings />} />
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
