import React from 'react';

export default function App() {
  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between p-6 md:p-12">
      <header className="max-w-5xl mx-auto w-full flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-800 pb-6 gap-4">
        <div>
          <span className="text-xs font-semibold tracking-wider text-emerald-400 uppercase bg-emerald-950/70 border border-emerald-800/60 px-3 py-1 rounded-full">
            Academic Project • 2026–2027
          </span>
          <h1 className="text-2xl md:text-3xl font-bold mt-3 text-white">
            Cloud-Based Food Waste Management System
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Department of Information Science and Engineering • The National Institute of Engineering, Mysuru
          </p>
        </div>
        <div className="text-right text-xs text-slate-400">
          <p className="font-medium text-slate-300">Student: Abhishek G P (4NI24IS096)</p>
          <p>Guide: Ms. Prajakta M</p>
        </div>
      </header>

      <section className="max-w-5xl mx-auto w-full my-auto py-12">
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-8 backdrop-blur shadow-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-4">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Step 1: Foundation Ready
          </div>
          <h2 className="text-xl md:text-2xl font-semibold text-white mb-3">
            GitHub-Ready Project Foundation Initialized
          </h2>
          <p className="text-slate-300 text-sm md:text-base leading-relaxed max-w-3xl mb-6">
            The core repository architecture, strict documentation framework, safe configuration placeholders, and container specifications are established. Full business workflows, authentication, database state machines, and dashboards will be built in subsequent phases.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-700/60">
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
              <span className="text-xs text-slate-400 uppercase font-semibold">Frontend</span>
              <p className="text-sm font-medium text-white mt-1">React 18 + Vite</p>
              <span className="text-xs text-emerald-400">Tailwind CSS</span>
            </div>
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
              <span className="text-xs text-slate-400 uppercase font-semibold">Backend</span>
              <p className="text-sm font-medium text-white mt-1">Node.js + Express</p>
              <span className="text-xs text-emerald-400">Modular Monolith</span>
            </div>
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
              <span className="text-xs text-slate-400 uppercase font-semibold">Database</span>
              <p className="text-sm font-medium text-white mt-1">PostgreSQL 16</p>
              <span className="text-xs text-emerald-400">ACID + Row Locks</span>
            </div>
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
              <span className="text-xs text-slate-400 uppercase font-semibold">Cloud & Ops</span>
              <p className="text-sm font-medium text-white mt-1">AWS EC2 + S3</p>
              <span className="text-xs text-emerald-400">Docker Compose</span>
            </div>
          </div>
        </div>
      </section>

      <footer className="max-w-5xl mx-auto w-full pt-6 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center text-xs text-slate-400 gap-2">
        <p>© 2026–2027 NIE Mysuru • Information Science and Engineering</p>
        <p className="text-slate-400">Awaiting user approval to proceed to Step 2</p>
      </footer>
    </main>
  );
}
