import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/layout/Layout';
import { ProtectedRoute } from './components/common/ProtectedRoute';

// Pages
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DonationListPage from './pages/DonationListPage';
import DonationDetailPage from './pages/DonationDetailPage';
import CreateDonationPage from './pages/CreateDonationPage';
import DashboardPage from './pages/DashboardPage';

function NotFoundPage() {
  return (
    <div className="max-w-md mx-auto my-16 p-8 bg-slate-900 border border-slate-800 rounded-3xl text-center">
      <h2 className="text-3xl font-extrabold text-white mb-2">404</h2>
      <p className="text-sm font-semibold text-slate-300 mb-1">Page Not Found</p>
      <p className="text-xs text-slate-500 mb-6">
        The requested URL was not found on this platform.
      </p>
      <Link
        to="/"
        className="inline-flex items-center px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors"
      >
        Return to Home
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            {/* Public Accessible Routes */}
            <Route index element={<LandingPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="register" element={<RegisterPage />} />
            <Route path="donations" element={<DonationListPage />} />
            <Route path="donations/:id" element={<DonationDetailPage />} />

            {/* Authenticated Dashboard Routes */}
            <Route
              path="dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />

            {/* Donor-Specific Creation Route */}
            <Route
              path="donations/new"
              element={
                <ProtectedRoute allowedRoles={['DONOR']}>
                  <CreateDonationPage />
                </ProtectedRoute>
              }
            />

            {/* Catch-all 404 Route */}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
