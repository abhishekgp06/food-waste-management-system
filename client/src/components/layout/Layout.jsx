import React from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import { useAuth } from '../../context/AuthContext';
import { AlertCircle } from 'lucide-react';

export default function Layout() {
  const { isPending, user } = useAuth();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-white">
      <Navbar />

      {/* Persistent warning banner for PENDING accounts */}
      {isPending && (
        <div className="bg-amber-950/80 border-b border-amber-800/60 px-4 py-2.5 text-xs text-amber-200">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Notice:</strong> Your <strong className="text-white">{user?.role}</strong> account is currently <strong>PENDING</strong> administrative verification.
                Operational actions (creating listings, claiming food, or viewing internal routes) will become available once approved.
              </span>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}
