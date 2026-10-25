import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api, { ApiError } from '../services/api';
import {
  Building2,
  HeartHandshake,
  Truck,
  ShieldCheck,
  PlusCircle,
  Clock,
  CheckCircle2,
  AlertCircle,
  Compass,
  ArrowRight,
  MapPin,
  Calendar,
  Layers,
  Sparkles,
  RefreshCw,
  XCircle,
  KeyRound
} from 'lucide-react';
import { PendingAccountNotice } from '../components/common/ProtectedRoute';

export default function DashboardPage() {
  const { user, token, isActive, isPending } = useAuth();

  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboardData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      if (user?.role === 'DONOR') {
        // Fetch donations created by this donor
        const data = await api.donations.list({ donor_id: user.id, limit: 50 }, token);
        setDonations(data.donations || []);
      } else if (user?.role === 'NGO') {
        // Fetch all donations (both available and claimed)
        const data = await api.donations.list({ limit: 50 }, token);
        setDonations(data.donations || []);
      } else {
        // Admin or Volunteer
        const data = await api.donations.list({ limit: 50 }, token);
        setDonations(data.donations || []);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to load dashboard data.');
      }
    } finally {
      setLoading(false);
    }
  }, [user, token]);

  useEffect(() => {
    if (isActive) {
      fetchDashboardData();
    } else {
      setLoading(false);
    }
  }, [isActive, fetchDashboardData]);

  // If user account is PENDING, show clear notice screen
  if (isPending) {
    return <PendingAccountNotice />;
  }

  // Render Role-Specific Views
  switch (user?.role) {
    case 'DONOR':
      return <DonorDashboard donations={donations} loading={loading} error={error} onRefresh={fetchDashboardData} user={user} />;
    case 'NGO':
      return <NgoDashboard donations={donations} loading={loading} error={error} onRefresh={fetchDashboardData} user={user} token={token} />;
    case 'VOLUNTEER':
      return <VolunteerDashboard donations={donations} loading={loading} error={error} onRefresh={fetchDashboardData} user={user} />;
    case 'ADMIN':
      return <AdminDashboard donations={donations} loading={loading} error={error} onRefresh={fetchDashboardData} user={user} />;
    default:
      return <GenericDashboard user={user} />;
  }
}

/**
 * DONOR Dashboard View
 */
function DonorDashboard({ donations, loading, error, onRefresh, user }) {
  const availableCount = donations.filter((d) => d.status === 'AVAILABLE').length;
  const claimedCount = donations.filter((d) => d.status === 'CLAIMED').length;
  const completedCount = donations.filter((d) => ['PICKED_UP', 'DELIVERED'].includes(d.status)).length;
  const totalVolume = donations.reduce((acc, d) => acc + (Number(d.quantity) || 0), 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-1">
            <Building2 className="w-4 h-4" />
            <span>Donor Operations Hub</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Welcome back, {user?.name}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Monitor active surplus listings, track claims in real-time, and post new food batches.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Link
            to="/donations/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-lg shadow-emerald-600/20"
          >
            <PlusCircle className="w-4 h-4" />
            Post New Donation
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur">
          <span className="text-xs uppercase font-semibold text-slate-400 block">Total Listings</span>
          <p className="text-2xl sm:text-3xl font-black text-white mt-1">{donations.length}</p>
          <span className="text-[11px] text-slate-500">Published to date</span>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-emerald-500/30 backdrop-blur">
          <span className="text-xs uppercase font-semibold text-emerald-400 block">Available Listings</span>
          <p className="text-2xl sm:text-3xl font-black text-emerald-400 mt-1">{availableCount}</p>
          <span className="text-[11px] text-slate-400">Ready for claiming</span>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-amber-500/30 backdrop-blur">
          <span className="text-xs uppercase font-semibold text-amber-400 block">Active Claims</span>
          <p className="text-2xl sm:text-3xl font-black text-amber-400 mt-1">{claimedCount}</p>
          <span className="text-[11px] text-slate-400">Awaiting NGO pickup</span>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-cyan-500/30 backdrop-blur">
          <span className="text-xs uppercase font-semibold text-cyan-400 block">Rescued & Diverted</span>
          <p className="text-2xl sm:text-3xl font-black text-cyan-400 mt-1">{completedCount}</p>
          <span className="text-[11px] text-slate-400">Delivered to shelters</span>
        </div>
      </div>

      {/* My Listings List */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">My Food Donation Listings</h2>
          <span className="text-xs text-slate-400">{donations.length} records</span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs text-slate-500 animate-pulse">Loading listings...</div>
        ) : donations.length === 0 ? (
          <div className="py-12 text-center max-w-sm mx-auto space-y-3">
            <Building2 className="w-10 h-10 text-slate-600 mx-auto" />
            <h3 className="text-base font-semibold text-white">No Donations Published Yet</h3>
            <p className="text-xs text-slate-400">
              Post surplus food from your kitchen or grocery to notify nearby NGOs immediately.
            </p>
            <Link
              to="/donations/new"
              className="inline-block mt-2 px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold text-xs"
            >
              Post First Donation
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {donations.map((d) => (
              <div
                key={d.id}
                className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-950/40 px-3 rounded-xl transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-emerald-400">
                      {d.category?.replace('_', ' ')}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        d.status === 'AVAILABLE'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : d.status === 'CLAIMED'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {d.status}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-white">{d.title}</h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {d.quantity} {d.unit} • Pickup Deadline: {new Date(d.pickup_deadline).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    to={`/donations/${d.id}`}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200"
                  >
                    Manage Listing
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * NGO Dashboard View
 */
function NgoDashboard({ donations, loading, error, onRefresh, user, token }) {
  // Active claims where donation is in CLAIMED status
  const claimedDonations = donations.filter((d) => d.status === 'CLAIMED');
  // Available donations ready for claiming
  const availableDonations = donations.filter((d) => d.status === 'AVAILABLE');

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-400 mb-1">
            <HeartHandshake className="w-4 h-4" />
            <span>NGO Food Rescue Center</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {user?.name} Rescue Console
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Claim surplus batches with atomic concurrency locks and track handover codes for volunteer collection.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Link
            to="/donations?mode=nearby"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold text-sm shadow-lg shadow-teal-600/20"
          >
            <MapPin className="w-4 h-4" />
            Find Nearby Food
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-amber-500/30 backdrop-blur">
          <span className="text-xs uppercase font-semibold text-amber-400 block">Active Claims</span>
          <p className="text-3xl font-black text-amber-400 mt-1">{claimedDonations.length}</p>
          <span className="text-[11px] text-slate-400">Awaiting pickup & verification</span>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-emerald-500/30 backdrop-blur">
          <span className="text-xs uppercase font-semibold text-emerald-400 block">Available Listings</span>
          <p className="text-3xl font-black text-emerald-400 mt-1">{availableDonations.length}</p>
          <span className="text-[11px] text-slate-400">Ready to claim right now</span>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur">
          <span className="text-xs uppercase font-semibold text-slate-400 block">Verification Protocol</span>
          <p className="text-lg font-bold text-white mt-1">6-Digit Code</p>
          <span className="text-[11px] text-teal-400">Cryptographic Handover</span>
        </div>
      </div>

      {/* Active Claims Section */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Active Food Claims</h2>
            <p className="text-xs text-slate-400">Provide the 6-digit handover code upon arrival at collection point</p>
          </div>
          <span className="text-xs text-amber-400 font-semibold">{claimedDonations.length} Active</span>
        </div>

        {claimedDonations.length === 0 ? (
          <div className="p-8 text-center bg-slate-950/60 rounded-2xl border border-slate-800/80">
            <p className="text-xs text-slate-400">No active claims in progress. Browse nearby food to rescue surplus batches!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {claimedDonations.map((d) => (
              <div
                key={d.id}
                className="p-5 rounded-2xl bg-slate-950/80 border border-amber-500/30 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-800">
                      CLAIMED
                    </span>
                    <h4 className="text-base font-bold text-white mt-1">{d.title}</h4>
                    <p className="text-xs text-slate-400">{d.quantity} {d.unit}</p>
                  </div>
                  <Link
                    to={`/donations/${d.id}`}
                    className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200"
                  >
                    View Details
                  </Link>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs space-y-1">
                  <p className="text-slate-400">Pickup Location: <strong className="text-white">{d.address}</strong></p>
                  <p className="text-slate-400">Deadline: <strong className="text-amber-300">{new Date(d.pickup_deadline).toLocaleString()}</strong></p>
                  {d.donor_phone && <p className="text-slate-400">Donor Phone: <strong className="text-white font-mono">{d.donor_phone}</strong></p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Available Opportunities Section */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Available Food Ready for Claiming</h2>
          <Link to="/donations" className="text-xs font-semibold text-emerald-400 hover:underline">
            View All ({availableDonations.length})
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {availableDonations.slice(0, 6).map((d) => (
            <div
              key={d.id}
              className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between"
            >
              <div>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-emerald-400">
                  {d.category?.replace('_', ' ')}
                </span>
                <h4 className="text-sm font-bold text-white mt-2 line-clamp-1">{d.title}</h4>
                <p className="text-xs text-slate-400 mt-1">{d.quantity} {d.unit}</p>
                <p className="text-xs text-slate-500 truncate mt-1">{d.address}</p>
              </div>

              <div className="pt-3 mt-3 border-t border-slate-800/80 flex items-center justify-between">
                <span className="text-[11px] text-amber-400">
                  Deadline: {new Date(d.pickup_deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <Link
                  to={`/donations/${d.id}`}
                  className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs"
                >
                  Claim
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * VOLUNTEER Dashboard View
 */
function VolunteerDashboard({ donations, loading, error, onRefresh, user }) {
  const availableCount = donations.filter((d) => d.status === 'AVAILABLE').length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400 mb-1">
            <Truck className="w-4 h-4" />
            <span>Volunteer Logistics Portal</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Welcome, Volunteer {user?.name}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Locate neighborhood surplus food and explore rescue routes.
          </p>
        </div>

        <Link
          to="/donations?mode=nearby"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-sm shadow-lg shadow-cyan-600/20"
        >
          <MapPin className="w-4 h-4" />
          Proximity Search
        </Link>
      </div>

      {/* Backend Roadmap Transparency Callout */}
      <div className="p-6 rounded-2xl bg-slate-900/90 border border-cyan-500/30 backdrop-blur space-y-2">
        <div className="flex items-center gap-2 text-cyan-300 font-bold text-sm">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span>System Capability Notice: Volunteer Direct Dispatch Engine</span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          In this phase of the Food Waste Management platform, donations are claimed directly by verified non-profit partners (NGOs).
          Direct volunteer pickup assignment, dispatch routing, and proof-of-delivery GPS tracking endpoints will be introduced in subsequent milestones.
          You can actively explore community listings and inspect pickup points below.
        </p>
      </div>

      {/* Community Opportunities */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Community Food Listings</h2>
          <span className="text-xs text-slate-400">{availableCount} Available</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {donations.filter((d) => d.status === 'AVAILABLE').slice(0, 9).map((d) => (
            <div key={d.id} className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-cyan-400">
                {d.category?.replace('_', ' ')}
              </span>
              <h4 className="text-sm font-bold text-white mt-2 line-clamp-1">{d.title}</h4>
              <p className="text-xs text-slate-400 mt-1">{d.quantity} {d.unit}</p>
              <p className="text-xs text-slate-500 mt-1 truncate">{d.address}</p>
              <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between">
                <span className="text-[11px] text-amber-400">
                  {new Date(d.pickup_deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <Link
                  to={`/donations/${d.id}`}
                  className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200"
                >
                  View Details
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * ADMIN Dashboard View
 */
function AdminDashboard({ donations, loading, error, onRefresh, user }) {
  const availableCount = donations.filter((d) => d.status === 'AVAILABLE').length;
  const claimedCount = donations.filter((d) => d.status === 'CLAIMED').length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-400 mb-1">
            <ShieldCheck className="w-4 h-4" />
            <span>Platform Administrative Oversight</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            System Administration
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Oversee active listings, monitor claim integrity, and moderate community food operations.
          </p>
        </div>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
          <span className="text-xs uppercase font-semibold text-slate-400 block">Total Registry</span>
          <p className="text-3xl font-black text-white mt-1">{donations.length}</p>
        </div>
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-emerald-500/30">
          <span className="text-xs uppercase font-semibold text-emerald-400 block">Available</span>
          <p className="text-3xl font-black text-emerald-400 mt-1">{availableCount}</p>
        </div>
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-amber-500/30">
          <span className="text-xs uppercase font-semibold text-amber-400 block">Claimed</span>
          <p className="text-3xl font-black text-amber-400 mt-1">{claimedCount}</p>
        </div>
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-cyan-500/30">
          <span className="text-xs uppercase font-semibold text-cyan-400 block">PostgreSQL</span>
          <p className="text-xl font-bold text-white mt-1">100% ACID</p>
        </div>
      </div>

      {/* All Recent Listings */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-4">
        <h2 className="text-lg font-bold text-white">System Donations Registry</h2>
        <div className="divide-y divide-slate-800">
          {donations.map((d) => (
            <div key={d.id} className="py-3 flex items-center justify-between gap-4">
              <div>
                <span className="text-xs font-semibold text-slate-300">{d.title}</span>
                <p className="text-[11px] text-slate-500">
                  Donor: {d.donor_name || d.donor_id} • Status: {d.status} • {d.quantity} {d.unit}
                </p>
              </div>
              <Link
                to={`/donations/${d.id}`}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
              >
                Inspect
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GenericDashboard({ user }) {
  return (
    <div className="p-8 text-center bg-slate-900 rounded-2xl border border-slate-800">
      <h2 className="text-xl font-bold text-white">Welcome, {user?.name}</h2>
      <p className="text-xs text-slate-400 mt-2">Explore active food donations across the platform.</p>
    </div>
  );
}
