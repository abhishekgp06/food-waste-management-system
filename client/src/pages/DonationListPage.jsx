import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api, { ApiError } from '../services/api';
import {
  Compass,
  MapPin,
  Clock,
  Filter,
  PlusCircle,
  AlertCircle,
  RefreshCw,
  Search,
  ChevronRight,
  Layers,
  Sparkles,
  Sliders
} from 'lucide-react';

const CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'COOKED_MEALS', label: 'Cooked Meals' },
  { value: 'RAW_INGREDIENTS', label: 'Raw Ingredients' },
  { value: 'PACKAGED_GROCERY', label: 'Packaged Grocery' },
  { value: 'BAKERY', label: 'Bakery & Bread' },
  { value: 'PRODUCE', label: 'Fresh Produce' },
  { value: 'OTHER', label: 'Other' },
];

export default function DonationListPage() {
  const { token, user, isAuthenticated, isActive } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Mode: 'all' | 'nearby'
  const [activeTab, setActiveTab] = useState(searchParams.get('mode') || 'all');

  // Filters for 'all' mode
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get('category') || '');
  const [page, setPage] = useState(1);

  // Filters for 'nearby' mode
  const [lat, setLat] = useState(user?.location_lat ? String(user.location_lat) : '12.3051');
  const [lng, setLng] = useState(user?.location_lng ? String(user.location_lng) : '76.6552');
  const [radiusKm, setRadiusKm] = useState('15');
  const [locating, setLocating] = useState(false);

  // Results state
  const [donations, setDonations] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDonations = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (activeTab === 'nearby') {
        const parsedLat = Number(lat);
        const parsedLng = Number(lng);
        const parsedRadius = Number(radiusKm);

        if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
          throw new Error('Please enter valid coordinates for nearby search.');
        }

        const data = await api.donations.getNearby(
          { lat: parsedLat, lng: parsedLng, radiusKm: parsedRadius, limit: 30 },
          token
        );
        setDonations(data.donations || []);
        setPagination({ total: data.count || 0, page: 1, limit: 30, totalPages: 1 });
      } else {
        const params = {
          page,
          limit: 12,
        };
        if (statusFilter) params.status = statusFilter;
        if (categoryFilter) params.category = categoryFilter;

        const data = await api.donations.list(params, token);
        setDonations(data.donations || []);
        setPagination(data.pagination || { total: 0, page: 1, limit: 12, totalPages: 1 });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(err.message || 'Failed to load donations.');
      }
    } finally {
      setLoading(false);
    }
  }, [activeTab, statusFilter, categoryFilter, page, lat, lng, radiusKm, token]);

  useEffect(() => {
    fetchDonations();
  }, [fetchDonations]);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setLocating(false);
      },
      (err) => {
        alert(`Location detection failed: ${err.message}`);
        setLocating(false);
      },
      { timeout: 8000 }
    );
  };

  const getUrgencyBadge = (deadlineStr, expiresStr) => {
    const deadline = new Date(deadlineStr);
    const now = new Date();
    const diffHours = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (diffHours <= 0) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
          Expired
        </span>
      );
    }
    if (diffHours < 2) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse">
          Urgent: &lt; 2h left
        </span>
      );
    }
    if (diffHours < 6) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
          Pickup in ~{Math.round(diffHours)}h
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
        Pickup in ~{Math.round(diffHours)}h
      </span>
    );
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'AVAILABLE':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
            AVAILABLE
          </span>
        );
      case 'CLAIMED':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-800">
            CLAIMED
          </span>
        );
      case 'PICKED_UP':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
            IN TRANSIT
          </span>
        );
      case 'DELIVERED':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950 text-blue-400 border border-blue-800">
            DELIVERED
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Post CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight flex items-center gap-2">
            <Compass className="w-7 h-7 text-emerald-400" />
            Food Donation Explorer
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Browse real-time community food donations or discover nearby rescues with Haversine proximity search.
          </p>
        </div>

        {isAuthenticated && user?.role === 'DONOR' && isActive && (
          <Link
            to="/donations/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-lg shadow-emerald-600/20 transition-all hover:scale-[1.02]"
          >
            <PlusCircle className="w-4 h-4" />
            Post New Donation
          </Link>
        )}
      </div>

      {/* Tabs & Filters Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl backdrop-blur space-y-4">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 bg-slate-950/70 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => {
                setActiveTab('all');
                setPage(1);
              }}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'all'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All Donations
            </button>
            <button
              onClick={() => {
                setActiveTab('nearby');
                setPage(1);
              }}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'nearby'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 text-emerald-300" />
              Nearby Proximity Search
            </button>
          </div>

          <button
            onClick={fetchDonations}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Filter Controls for Standard List */}
        {activeTab === 'all' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Category
              </label>
              <select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="">All Statuses</option>
                <option value="AVAILABLE">AVAILABLE (Ready for claim)</option>
                <option value="CLAIMED">CLAIMED</option>
                <option value="PICKED_UP">PICKED_UP</option>
                <option value="DELIVERED">DELIVERED</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setCategoryFilter('');
                  setStatusFilter('');
                  setPage(1);
                }}
                className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors"
              >
                Reset Filters
              </button>
            </div>
          </div>
        )}

        {/* Filter Controls for Nearby Proximity */}
        {activeTab === 'nearby' && (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Latitude
              </label>
              <input
                type="number"
                step="any"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Longitude
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="any"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  disabled={locating}
                  title="Detect coordinates from GPS"
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 shrink-0"
                >
                  <MapPin className={`w-3.5 h-3.5 ${locating ? 'animate-bounce' : ''}`} />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Radius: <strong className="text-emerald-400">{radiusKm} km</strong>
              </label>
              <input
                type="range"
                min="1"
                max="50"
                value={radiusKm}
                onChange={(e) => setRadiusKm(e.target.value)}
                className="w-full accent-emerald-500 mt-2"
              />
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={fetchDonations}
                disabled={loading}
                className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-colors"
              >
                Calculate Proximity
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={fetchDonations}
            className="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 font-semibold"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-5 animate-pulse space-y-4"
            >
              <div className="flex justify-between">
                <div className="w-20 h-4 bg-slate-800 rounded"></div>
                <div className="w-16 h-4 bg-slate-800 rounded"></div>
              </div>
              <div className="w-3/4 h-5 bg-slate-800 rounded"></div>
              <div className="w-full h-12 bg-slate-800/60 rounded-xl"></div>
              <div className="flex justify-between pt-2">
                <div className="w-24 h-4 bg-slate-800 rounded"></div>
                <div className="w-16 h-4 bg-slate-800 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      ) : donations.length === 0 ? (
        /* Empty State */
        <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-12 text-center max-w-lg mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-slate-800/80 text-slate-400 flex items-center justify-center mx-auto mb-4">
            <Compass className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-white mb-1">No Food Donations Found</h3>
          <p className="text-xs text-slate-400 leading-relaxed mb-6">
            {activeTab === 'nearby'
              ? `There are currently no available donations within ${radiusKm} km of your specified coordinates.`
              : 'There are no donations matching the chosen category and status filters.'}
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => {
                setCategoryFilter('');
                setStatusFilter('');
                if (activeTab === 'nearby') setRadiusKm('30');
              }}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200"
            >
              Expand Search Filters
            </button>
            {isAuthenticated && user?.role === 'DONOR' && isActive && (
              <Link
                to="/donations/new"
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
              >
                Post First Donation
              </Link>
            )}
          </div>
        </div>
      ) : (
        /* Donation Cards Grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {donations.map((d) => (
            <Link
              key={d.id}
              to={`/donations/${d.id}`}
              className="group bg-slate-900/70 border border-slate-800/80 hover:border-emerald-500/50 rounded-2xl p-5 shadow-lg backdrop-blur flex flex-col justify-between transition-all hover:scale-[1.01] hover:shadow-emerald-500/5"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-emerald-400 border border-slate-700">
                    {d.category?.replace('_', ' ')}
                  </span>
                  {getStatusBadge(d.status)}
                </div>

                <h3 className="text-base font-bold text-white group-hover:text-emerald-400 transition-colors line-clamp-1">
                  {d.title}
                </h3>

                <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                  {d.description || 'Surplus nutritious food ready for community collection and distribution.'}
                </p>

                {/* Key stats row */}
                <div className="grid grid-cols-2 gap-2 my-4 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-slate-500 block">Quantity</span>
                    <span className="font-bold text-white">
                      {d.quantity} {d.unit}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-semibold text-slate-500 block">Location</span>
                    <span className="text-slate-300 truncate block" title={d.address}>
                      {d.distance_km !== undefined ? (
                        <strong className="text-emerald-400">{d.distance_km} km away</strong>
                      ) : (
                        d.address
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  {getUrgencyBadge(d.pickup_deadline, d.expires_at)}
                </div>

                <div className="flex items-center gap-1 text-emerald-400 font-semibold group-hover:translate-x-0.5 transition-transform">
                  <span>Details</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination Bar for standard mode */}
      {activeTab === 'all' && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 disabled:opacity-40 hover:bg-slate-800"
          >
            Previous
          </button>
          <span className="text-xs text-slate-400 px-2">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} listings)
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            disabled={page === pagination.totalPages || loading}
            className="px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 disabled:opacity-40 hover:bg-slate-800"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
