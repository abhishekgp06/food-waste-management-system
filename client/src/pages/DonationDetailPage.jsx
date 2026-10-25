import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api, { ApiError } from '../services/api';
import {
  HeartHandshake,
  Clock,
  MapPin,
  Calendar,
  Building2,
  Phone,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Edit,
  ArrowLeft,
  KeyRound,
  ShieldAlert,
  XCircle,
  RefreshCw,
  ExternalLink
} from 'lucide-react';

export default function DonationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, user, isAuthenticated, isActive } = useAuth();

  const [donation, setDonation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Claim modal state
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState(null);
  const [claimSuccessData, setClaimSuccessData] = useState(null);

  // Cancel-claim modal state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('Volunteer transport unavailable');
  const [cancelError, setCancelError] = useState(null);

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [updating, setUpdating] = useState(false);
  const [editError, setEditError] = useState(null);

  const fetchDonation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.donations.getById(id, token);
      setDonation(data.donation);
      setEditTitle(data.donation.title);
      setEditQuantity(String(data.donation.quantity));
      setEditDescription(data.donation.description || '');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to load donation details.');
      }
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    fetchDonation();
  }, [fetchDonation]);

  const isOwner = user && donation && user.id === donation.donor_id;
  const isAdmin = user && user.role === 'ADMIN';
  const isNgo = user && user.role === 'NGO';
  const isAvailable = donation && donation.status === 'AVAILABLE';
  const isClaimed = donation && donation.status === 'CLAIMED';

  // Check if expired
  const isExpired = donation && new Date(donation.expires_at).getTime() <= Date.now();
  const isDeadlinePassed = donation && new Date(donation.pickup_deadline).getTime() <= Date.now();

  const handleClaim = async () => {
    setClaiming(true);
    setClaimError(null);
    try {
      const res = await api.donations.claim(id, token);
      setClaimSuccessData(res);
      setDonation(res.donation);
      setShowClaimModal(false);
    } catch (err) {
      if (err instanceof ApiError) {
        setClaimError(err.message);
      } else {
        setClaimError('Claim request failed. Please try again.');
      }
    } finally {
      setClaiming(false);
    }
  };

  const handleCancelClaim = async () => {
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await api.donations.cancelClaim(id, cancelReason, token);
      setDonation(res.donation);
      setShowCancelModal(false);
      setClaimSuccessData(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setCancelError(err.message);
      } else {
        setCancelError('Failed to cancel claim. Please try again.');
      }
    } finally {
      setCancelling(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.donations.delete(id, token);
      navigate('/donations');
    } catch (err) {
      alert(err.message || 'Failed to delete donation');
      setDeleting(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setUpdating(true);
    setEditError(null);
    try {
      const res = await api.donations.update(
        id,
        {
          title: editTitle.trim(),
          quantity: Number(editQuantity),
          description: editDescription.trim() || null,
        },
        token
      );
      setDonation(res.donation);
      setShowEditModal(false);
    } catch (err) {
      setEditError(err.message || 'Failed to update donation.');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-12 flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
        <p className="text-xs text-slate-400 font-medium">Loading donation details...</p>
      </div>
    );
  }

  if (error || !donation) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <div className="p-8 bg-slate-900 border border-slate-800 rounded-2xl">
          <AlertCircle className="w-12 h-12 text-rose-400 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-white mb-2">Donation Unavailable</h2>
          <p className="text-xs text-slate-400 mb-6">{error || 'Donation record not found.'}</p>
          <Link
            to="/donations"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to All Donations
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-4">
      {/* Back button & Action controls */}
      <div className="flex items-center justify-between gap-4">
        <Link
          to="/donations"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Listings
        </Link>

        {/* Owner / Admin Management Buttons */}
        {(isOwner || isAdmin) && isAvailable && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEditModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
            >
              <Edit className="w-3.5 h-3.5" />
              Edit Listing
            </button>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-medium border border-rose-500/30 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Listing
            </button>
          </div>
        )}
      </div>

      {/* Main Card */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl backdrop-blur space-y-8">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                {donation.category?.replace('_', ' ')}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  donation.status === 'AVAILABLE'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : donation.status === 'CLAIMED'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                {donation.status}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {donation.title}
            </h1>
          </div>

          <div className="sm:text-right">
            <span className="text-xs uppercase font-semibold text-slate-500 block">Available Quantity</span>
            <span className="text-2xl font-black text-emerald-400">
              {donation.quantity} <span className="text-sm font-semibold text-slate-300">{donation.unit}</span>
            </span>
          </div>
        </div>

        {/* Handover Code Banner (If claim was just completed) */}
        {claimSuccessData && (
          <div className="p-6 rounded-2xl bg-emerald-950/90 border border-emerald-500/50 shadow-xl space-y-3">
            <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span>Claim Successfully Confirmed in PostgreSQL Transaction!</span>
            </div>
            <p className="text-xs text-slate-300">
              Present this cryptographically generated 6-digit handover verification code upon arrival at the donor's location:
            </p>
            <div className="p-4 rounded-xl bg-slate-950/80 border border-emerald-500/40 text-center">
              <span className="text-xs text-slate-400 uppercase font-semibold block mb-1">Secure Handover Code</span>
              <span className="text-3xl sm:text-4xl font-mono font-black tracking-widest text-emerald-400">
                {claimSuccessData.claim?.handover_code}
              </span>
            </div>
          </div>
        )}

        {/* Description */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Description</h3>
          <p className="text-sm text-slate-300 leading-relaxed bg-slate-950/50 p-4 rounded-xl border border-slate-800/80">
            {donation.description || 'Nutritious commercial surplus food prepared in accordance with food hygiene standards.'}
          </p>
        </div>

        {/* Timeline & Expiry Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold mb-1">
              <Calendar className="w-4 h-4 text-emerald-400" />
              <span>Prepared Timestamp</span>
            </div>
            <p className="text-sm font-bold text-white">
              {donation.prepared_at ? new Date(donation.prepared_at).toLocaleString() : 'Not Specified'}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold mb-1">
              <Clock className="w-4 h-4 text-amber-400" />
              <span>Pickup Deadline</span>
            </div>
            <p className="text-sm font-bold text-white">
              {new Date(donation.pickup_deadline).toLocaleString()}
            </p>
            {isDeadlinePassed && (
              <span className="text-[10px] font-semibold text-rose-400 block mt-0.5">Deadline Passed</span>
            )}
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold mb-1">
              <Clock className="w-4 h-4 text-rose-400" />
              <span>Safe Expiration Date</span>
            </div>
            <p className="text-sm font-bold text-white">
              {new Date(donation.expires_at).toLocaleString()}
            </p>
            {isExpired && (
              <span className="text-[10px] font-semibold text-rose-400 block mt-0.5">Expired</span>
            )}
          </div>
        </div>

        {/* Location & Donor Contact */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold">
              <MapPin className="w-4 h-4 text-emerald-400" />
              <span>Pickup Address & Coordinates</span>
            </div>
            <p className="text-sm font-bold text-white">{donation.address}</p>
            {donation.latitude && donation.longitude && (
              <p className="text-xs text-slate-400 font-mono">
                Lat: {donation.latitude}, Lng: {donation.longitude}
              </p>
            )}
          </div>

          <div className="p-5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold">
              <Building2 className="w-4 h-4 text-teal-400" />
              <span>Donor Organization Contact</span>
            </div>
            <p className="text-sm font-bold text-white">{donation.donor_name || 'Verified Food Donor'}</p>
            {donation.donor_phone && (
              <p className="text-xs text-slate-300 flex items-center gap-1.5 font-mono">
                <Phone className="w-3.5 h-3.5 text-emerald-400" />
                {donation.donor_phone}
              </p>
            )}
          </div>
        </div>

        {/* Claim & Cancel Action Controls */}
        <div className="pt-4 border-t border-slate-800">
          {/* Case 1: Donation is AVAILABLE */}
          {isAvailable && (
            <div>
              {isExpired || isDeadlinePassed ? (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>This donation has reached its pickup deadline or expiration time and can no longer be claimed.</span>
                </div>
              ) : isOwner ? (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 text-xs">
                  You created this donation listing. Donors cannot claim their own donations.
                </div>
              ) : !isAuthenticated ? (
                <div className="flex items-center justify-between p-4 rounded-xl bg-slate-950 border border-slate-800">
                  <p className="text-xs text-slate-400">Registered NGOs can claim this food for immediate distribution.</p>
                  <Link
                    to="/login"
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs"
                  >
                    Log In to Claim
                  </Link>
                </div>
              ) : isNgo && isActive ? (
                <button
                  type="button"
                  onClick={() => setShowClaimModal(true)}
                  className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-base shadow-xl shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all hover:scale-[1.01]"
                >
                  <HeartHandshake className="w-5 h-5" />
                  <span>Claim This Food Donation for NGO</span>
                </button>
              ) : isNgo && !isActive ? (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                  Your NGO account is currently PENDING verification. Once approved by administrators, you will be able to claim food listings.
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 text-xs">
                  Only verified NGO partner accounts may claim food donations.
                </div>
              )}
            </div>
          )}

          {/* Case 2: Donation is CLAIMED -> Allow claimant NGO or Admin to Cancel Claim */}
          {isClaimed && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>This donation is currently CLAIMED and awaiting pickup collection.</span>
                </div>
                {(isNgo || isAdmin) && (
                  <button
                    onClick={() => setShowCancelModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-semibold text-xs border border-rose-500/40"
                  >
                    Cancel Claim
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Claim Confirmation Modal */}
      {showClaimModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                <HeartHandshake className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Confirm Food Rescue Claim</h3>
                <p className="text-xs text-slate-400">PostgreSQL row lock will lock this claim atomically</p>
              </div>
            </div>

            {claimError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{claimError}</span>
              </div>
            )}

            <p className="text-xs text-slate-300 leading-relaxed">
              By confirming, your NGO agrees to dispatch a volunteer or driver to collect{' '}
              <strong className="text-white">{donation.quantity} {donation.unit}</strong> of{' '}
              <strong className="text-emerald-400">{donation.title}</strong> before the pickup deadline ({new Date(donation.pickup_deadline).toLocaleTimeString()}).
            </p>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowClaimModal(false);
                  setClaimError(null);
                }}
                disabled={claiming}
                className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={handleClaim}
                disabled={claiming}
                className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-1.5"
              >
                {claiming ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                    <span>Locking Claim...</span>
                  </>
                ) : (
                  <span>Confirm Claim</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Claim Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400">
                <XCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Cancel Claim</h3>
                <p className="text-xs text-slate-400">Release donation back to AVAILABLE pool</p>
              </div>
            </div>

            {cancelError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {cancelError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Reason for cancellation
              </label>
              <textarea
                rows="3"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                placeholder="Reason for releasing this food donation..."
              ></textarea>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowCancelModal(false);
                  setCancelError(null);
                }}
                disabled={cancelling}
                className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Keep Claim
              </button>
              <button
                type="button"
                onClick={handleCancelClaim}
                disabled={cancelling}
                className="py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg"
              >
                {cancelling ? 'Releasing...' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white">Delete Food Donation Listing?</h3>
            <p className="text-xs text-slate-300">
              This action will permanently delete this donation from the available registry.
            </p>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
              >
                {deleting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white">Edit Donation Details</h3>

            {editError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {editError}
              </div>
            )}

            <form onSubmit={handleUpdate} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Quantity ({donation.unit})</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={editQuantity}
                  onChange={(e) => setEditQuantity(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Description</label>
                <textarea
                  rows="2"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  disabled={updating}
                  className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                >
                  {updating ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
