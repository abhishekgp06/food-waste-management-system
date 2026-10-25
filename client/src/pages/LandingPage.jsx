import React from 'react';
import { Link } from 'react-router-dom';
import {
  HeartHandshake,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  MapPin,
  Clock,
  Truck,
  Building2,
  CheckCircle2,
  Leaf
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LandingPage() {
  const { isAuthenticated, user } = useAuth();

  return (
    <div className="space-y-16 py-4">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 p-8 sm:p-14 shadow-2xl">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-96 h-96 rounded-full bg-teal-500/10 blur-3xl pointer-events-none"></div>

        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI-Assisted Cloud Food Redistribution Network</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-tight mb-6">
            Bridging Surplus Food to <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">Zero Hunger</span> Communities
          </h1>

          <p className="text-base sm:text-lg text-slate-300 leading-relaxed mb-8 max-w-2xl">
            A high-concurrency cloud platform connecting restaurants, caterers, and grocers with verified NGOs and volunteer logistics. Powered by PostgreSQL atomic claim locks, Haversine proximity routing, and verifiable handover codes.
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <Link
              to="/donations"
              className="px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition-all hover:scale-[1.02]"
            >
              Browse Active Donations
              <ArrowRight className="w-4 h-4" />
            </Link>

            {isAuthenticated ? (
              <Link
                to="/dashboard"
                className="px-6 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm border border-slate-700 transition-colors"
              >
                Go to {user?.role} Dashboard
              </Link>
            ) : (
              <Link
                to="/register"
                className="px-6 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm border border-slate-700 transition-colors"
              >
                Join as Donor or NGO
              </Link>
            )}
          </div>
        </div>

        {/* Live metric cards */}
        <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-4 mt-12 pt-8 border-t border-slate-800/80">
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
            <span className="text-xs text-slate-400 uppercase font-semibold">Concurrency</span>
            <p className="text-xl font-bold text-white mt-1">ACID Safe</p>
            <span className="text-[11px] text-emerald-400">Atomic Row Locks</span>
          </div>
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
            <span className="text-xs text-slate-400 uppercase font-semibold">Proximity</span>
            <p className="text-xl font-bold text-white mt-1">Haversine</p>
            <span className="text-[11px] text-emerald-400">Geo Bounding Box</span>
          </div>
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
            <span className="text-xs text-slate-400 uppercase font-semibold">Security</span>
            <p className="text-xl font-bold text-white mt-1">6-Digit Code</p>
            <span className="text-[11px] text-emerald-400">Handover Verification</span>
          </div>
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
            <span className="text-xs text-slate-400 uppercase font-semibold">Audit Trail</span>
            <p className="text-xl font-bold text-white mt-1">Immutable</p>
            <span className="text-[11px] text-emerald-400">Event Logging</span>
          </div>
        </div>
      </section>

      {/* Stakeholder Ecosystem */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-white">Engineered for Three Core Stakeholders</h2>
          <p className="text-slate-400 text-sm mt-2">
            Tailored workflows ensure immediate food redistribution before expiration.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 hover:border-emerald-500/40 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Food Donors</h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-4">
              Restaurants, caterers, and grocery stores can publish surplus food listings in under 60 seconds with strict pickup deadlines and volume counts.
            </p>
            <ul className="text-xs text-slate-300 space-y-1.5">
              <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Instant active listing</li>
              <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Live claim tracking</li>
            </ul>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 hover:border-emerald-500/40 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center mb-4">
              <HeartHandshake className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Verified NGOs</h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-4">
              Certified non-profits claim nearby food with race-free concurrency guarantees, obtaining a secure 6-digit handover code for pickup.
            </p>
            <ul className="text-xs text-slate-300 space-y-1.5">
              <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-teal-400" /> Conflict-free claiming</li>
              <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-teal-400" /> Handover code verification</li>
            </ul>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 hover:border-emerald-500/40 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mb-4">
              <Truck className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Community Volunteers</h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-4">
              Local volunteers inspect rescue opportunities across their neighborhood, providing the vital last-mile transport to shelters.
            </p>
            <ul className="text-xs text-slate-300 space-y-1.5">
              <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" /> Proximity radius search</li>
              <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" /> Verified identity network</li>
            </ul>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="bg-slate-900/40 border border-slate-800/80 rounded-3xl p-8 sm:p-12">
        <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-10">
          The 4-Step Zero Waste Lifecycle
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="relative p-6 bg-slate-950/60 border border-slate-800 rounded-2xl">
            <span className="text-xs font-bold text-emerald-400">STEP 01</span>
            <h4 className="text-base font-bold text-white mt-1 mb-2">Listing Created</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Donor logs meal details, portion sizes, preparation time, and strict pickup deadline.
            </p>
          </div>

          <div className="relative p-6 bg-slate-950/60 border border-slate-800 rounded-2xl">
            <span className="text-xs font-bold text-emerald-400">STEP 02</span>
            <h4 className="text-base font-bold text-white mt-1 mb-2">Proximity Discovery</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Nearby NGOs locate the donation within seconds using Haversine radial distance filter.
            </p>
          </div>

          <div className="relative p-6 bg-slate-950/60 border border-slate-800 rounded-2xl">
            <span className="text-xs font-bold text-emerald-400">STEP 03</span>
            <h4 className="text-base font-bold text-white mt-1 mb-2">Atomic Claiming</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              PostgreSQL row-level lock ensures single-claim winner and issues 6-digit handover code.
            </p>
          </div>

          <div className="relative p-6 bg-slate-950/60 border border-slate-800 rounded-2xl">
            <span className="text-xs font-bold text-emerald-400">STEP 04</span>
            <h4 className="text-base font-bold text-white mt-1 mb-2">Audit Verification</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Handover code confirmed at collection point; immutable event logged in audit trail.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
