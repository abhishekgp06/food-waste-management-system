import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api, { ApiError } from '../services/api';
import {
  PlusCircle,
  MapPin,
  Clock,
  Calendar,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Building2,
  Sparkles,
  Info
} from 'lucide-react';

const CATEGORIES = [
  { value: 'COOKED_MEALS', label: 'Cooked Meals (Catering, Restaurant portions)' },
  { value: 'RAW_INGREDIENTS', label: 'Raw Ingredients (Vegetables, grains, meat, dairy)' },
  { value: 'PACKAGED_GROCERY', label: 'Packaged Grocery (Canned goods, dry pasta, snacks)' },
  { value: 'BAKERY', label: 'Bakery & Bread (Bread loaves, pastries, bagels)' },
  { value: 'PRODUCE', label: 'Fresh Produce (Fruits, salad greens, herbs)' },
  { value: 'OTHER', label: 'Other Food Items' },
];

const UNITS = ['KG', 'PORTIONS', 'PACKAGES', 'BOXES', 'LITERS'];

export default function CreateDonationPage() {
  const navigate = useNavigate();
  const { token, user } = useAuth();

  // Calculate default timestamps (prepared: now, deadline: +4h, expires: +8h)
  const now = new Date();
  const defaultPrepared = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString().slice(0, 16);
  const defaultDeadline = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString().slice(0, 16);
  const defaultExpires = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('COOKED_MEALS');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('PORTIONS');
  const [preparedAt, setPreparedAt] = useState(defaultPrepared);
  const [pickupDeadline, setPickupDeadline] = useState(defaultDeadline);
  const [expiresAt, setExpiresAt] = useState(defaultExpires);
  const [address, setAddress] = useState('NIE Boys Hostel Mess, Mananthavadi Road, Mysuru');
  const [latitude, setLatitude] = useState(user?.location_lat ? String(user.location_lat) : '12.2831');
  const [longitude, setLongitude] = useState(user?.location_lng ? String(user.location_lng) : '76.6415');
  const [locating, setLocating] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [errorDetails, setErrorDetails] = useState([]);

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setLocating(false);
      },
      (err) => {
        alert(`Location acquisition failed: ${err.message}`);
        setLocating(false);
      },
      { timeout: 8000 }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage(null);
    setErrorDetails([]);

    // Client-side cross-field validation matching backend
    const deadlineTime = new Date(pickupDeadline).getTime();
    const expiresTime = new Date(expiresAt).getTime();
    const currentTime = Date.now();

    if (deadlineTime <= currentTime) {
      setErrorMessage('Pickup deadline must be in the future.');
      return;
    }

    if (expiresTime <= currentTime) {
      setErrorMessage('Expiration date must be in the future.');
      return;
    }

    if (deadlineTime > expiresTime) {
      setErrorMessage('Pickup deadline must not be later than the safe expiration timestamp.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        category,
        description: description.trim() || undefined,
        quantity: Number(quantity),
        unit,
        prepared_at: preparedAt ? new Date(preparedAt).toISOString() : undefined,
        pickup_deadline: new Date(pickupDeadline).toISOString(),
        expires_at: new Date(expiresAt).toISOString(),
        address: address.trim(),
        latitude: latitude ? Number(latitude) : undefined,
        longitude: longitude ? Number(longitude) : undefined,
      };

      const res = await api.donations.create(payload, token);
      if (res?.donation?.id) {
        navigate(`/donations/${res.donation.id}`);
      } else {
        navigate('/donations');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
        setErrorDetails(err.details || []);
      } else {
        setErrorMessage('Failed to create donation. Please verify your fields.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-6">
      <Link
        to="/donations"
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Listings
      </Link>

      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl backdrop-blur space-y-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-2">
            <Building2 className="w-4 h-4" />
            <span>Donor Food Rescue Dispatch</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Publish New Food Donation Listing
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Registered commercial surplus will be instantly broadcast to verified NGOs and local volunteers.
          </p>
        </div>

        {errorMessage && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-200">{errorMessage}</p>
              {errorDetails.length > 0 && (
                <ul className="mt-1 list-disc list-inside space-y-0.5 text-rose-300">
                  {errorDetails.map((d, idx) => (
                    <li key={idx}>{d.message || d.field}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5" htmlFor="f-title">
                Donation Title *
              </label>
              <input
                id="f-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. 50 Packaged Meals - Fresh Veg Biryani"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5" htmlFor="f-category">
                Food Category *
              </label>
              <select
                id="f-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quantity & Unit */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5" htmlFor="f-qty">
                Surplus Quantity *
              </label>
              <input
                id="f-qty"
                type="number"
                step="any"
                min="0.1"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="50"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5" htmlFor="f-unit">
                Measurement Unit *
              </label>
              <select
                id="f-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5" htmlFor="f-desc">
              Description & Packaging Details
            </label>
            <textarea
              id="f-desc"
              rows="3"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Freshly prepared lunch catering surplus. Packed into sterile food-grade containers with disposable cutlery..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Timeline & Deadlines */}
          <div className="p-5 rounded-2xl bg-slate-950/50 border border-slate-800/80 space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider">
              <Clock className="w-4 h-4" />
              <span>Rescue Timelines & Food Safety</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1" htmlFor="f-prep">
                  Prepared Timestamp
                </label>
                <input
                  id="f-prep"
                  type="datetime-local"
                  value={preparedAt}
                  onChange={(e) => setPreparedAt(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1" htmlFor="f-deadline">
                  Pickup Deadline *
                </label>
                <input
                  id="f-deadline"
                  type="datetime-local"
                  required
                  value={pickupDeadline}
                  onChange={(e) => setPickupDeadline(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1" htmlFor="f-expires">
                  Safe Expiration Date *
                </label>
                <input
                  id="f-expires"
                  type="datetime-local"
                  required
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                />
              </div>
            </div>
          </div>

          {/* Location & GPS */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5" htmlFor="f-address">
                Pickup Address *
              </label>
              <input
                id="f-address"
                type="text"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Building Name, Street, Ward, City"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5" htmlFor="f-lat">
                  Latitude (for Haversine Proximity)
                </label>
                <input
                  id="f-lat"
                  type="number"
                  step="any"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="12.3051"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5" htmlFor="f-lng">
                  Longitude (for Haversine Proximity)
                </label>
                <div className="flex gap-2">
                  <input
                    id="f-lng"
                    type="number"
                    step="any"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    placeholder="76.6552"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={handleGetLocation}
                    disabled={locating}
                    title="Detect GPS coordinates"
                    className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 shrink-0"
                  >
                    <MapPin className={`w-4 h-4 ${locating ? 'animate-bounce' : ''}`} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-base shadow-xl shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all hover:scale-[1.01]"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                <span>Publishing Listing to Registry...</span>
              </>
            ) : (
              <>
                <span>Publish Food Donation</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
