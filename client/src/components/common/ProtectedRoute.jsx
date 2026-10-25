import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Clock, AlertTriangle } from 'lucide-react';

/**
 * Route wrapper that ensures user is authenticated, and optionally checks allowed roles.
 */
export function ProtectedRoute({ children, allowedRoles = [] }) {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
          <p className="text-slate-400 text-sm font-medium">Verifying session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If specific roles are required, ensure user has one of them
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 bg-slate-900 border border-slate-800 rounded-2xl text-center">
        <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4 text-amber-400">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Access Restricted</h2>
        <p className="text-slate-400 text-sm mb-6">
          This area is designated for <span className="text-emerald-400 font-semibold">{allowedRoles.join(', ')}</span> accounts.
          Your current account role is <span className="text-slate-200 font-semibold">{user.role}</span>.
        </p>
        <a
          href="/dashboard"
          className="inline-flex items-center px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-colors"
        >
          Return to Dashboard
        </a>
      </div>
    );
  }

  return children;
}

/**
 * Screen presented when an authenticated user has status === 'PENDING'.
 * In our system, NGO and VOLUNTEER registrations create PENDING accounts awaiting admin approval.
 */
export function PendingAccountNotice() {
  const { user } = useAuth();

  return (
    <div className="max-w-2xl mx-auto my-12 p-8 bg-slate-900/90 border border-amber-500/30 rounded-2xl shadow-xl backdrop-blur">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
          <Clock className="w-8 h-8" />
        </div>
        <div>
          <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 mb-2">
            Status: PENDING VERIFICATION
          </span>
          <h2 className="text-2xl font-bold text-white mb-2">Account Under Review</h2>
          <p className="text-slate-300 text-sm leading-relaxed mb-4">
            Welcome, <strong className="text-white">{user?.name}</strong>! Your registration as an{' '}
            <strong className="text-emerald-400">{user?.role}</strong> has been submitted.
            In compliance with platform safety regulations, operational donation actions (such as claiming food or browsing operational routes) require administrative verification.
          </p>
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 text-xs text-slate-400 space-y-1.5">
            <p>• Account Email: <span className="text-slate-200">{user?.email}</span></p>
            <p>• Role: <span className="text-slate-200">{user?.role}</span></p>
            <p>• Verification: A platform administrator is reviewing your details.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
