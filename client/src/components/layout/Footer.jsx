import React from 'react';
import { Heart, Github, GraduationCap } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-slate-950 border-t border-slate-800 text-slate-400 py-10 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white tracking-tight">Food Waste Management System</span>
              <span className="text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded-full">
                Phase 5 SPA
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              Connecting commercial food donors with community NGOs and verified volunteer logistics to eliminate urban hunger and curb landfill methane emissions.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5 text-slate-400 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
              <GraduationCap className="w-4 h-4 text-emerald-400" />
              <span>Dept of ISE • The National Institute of Engineering, Mysuru</span>
            </div>
            <div className="text-slate-500 text-center sm:text-right">
              <p>Student: Abhishek G P (4NI24IS096)</p>
              <p>Guide: Ms. Prajakta M</p>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <p>© 2026–2027 Food Waste Management System. All rights reserved.</p>
          <p className="flex items-center gap-1">
            Built with <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" /> for community sustainability
          </p>
        </div>
      </div>
    </footer>
  );
}
