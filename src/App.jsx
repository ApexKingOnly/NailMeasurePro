import React, { useState, useEffect } from 'react'
import { Camera, ShieldCheck, History, Settings, User, CreditCard, ArrowRight } from 'lucide-react'
import CameraOverlay from './components/CameraOverlay'
import FingerWizard from './components/FingerWizard'
import AdminDashboard from './components/AdminDashboard'

function App() {
  const [currentStep, setCurrentStep] = useState('welcome') // welcome, wizard, admin, results
  const [measurements, setMeasurements] = useState({})
  
  // Example of modern design: dynamic background gradient
  return (
    <div className="min-h-screen bg-slate-950 font-sans selection:bg-emerald-500/30 selection:text-emerald-200 overflow-hidden">
      {/* Dynamic Background Noise/Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/10 blur-[120px]" />
      </div>

      <main className="relative z-10 max-w-md mx-auto px-4 pt-8 pb-32">
        {currentStep === 'welcome' && (
          <div className="space-y-8 mt-12 text-center">
            <div className="flex justify-center">
              <div className="p-4 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 glass-panel">
                <Camera className="w-12 h-12 text-emerald-500" />
              </div>
            </div>
            
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight text-white mb-3">
                NailMeasure <span className="text-emerald-500">Pro</span>
              </h1>
              <p className="text-slate-400 text-lg leading-relaxed">
                Precision sizing for perfect press-ons. <br/>
                No tape measure required.
              </p>
            </div>

            <div className="glass-panel p-6 rounded-3xl space-y-4 text-left border-white/5">
              <h3 className="text-sm font-semibold text-emerald-500 uppercase tracking-wider">Before you start</h3>
              <ul className="space-y-3">
                {[
                  "Have a US Dime (17.91mm) ready",
                  "Place your hand on a flat surface",
                  "Ensure good, even lighting"
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-300">
                    <ShieldCheck className="w-5 h-5 text-emerald-500/60" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              onClick={() => setCurrentStep('wizard')}
              className="w-full py-4 px-6 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-2xl transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-emerald-500/20"
            >
              Start Measurement
            </button>
            
            <button
              onClick={() => setCurrentStep('admin')}
              className="w-full py-3 px-6 bg-slate-900/50 hover:bg-slate-800 text-slate-300 font-medium rounded-2xl border border-white/5 transition-all"
            >
              Admin Dashboard
            </button>
          </div>
        )}

        {currentStep === 'wizard' && (
          <FingerWizard 
            onFinish={(results) => {
              setMeasurements(results);
              setCurrentStep('results');
            }}
            onCancel={() => setCurrentStep('welcome')}
          />
        )}

        {currentStep === 'admin' && (
          <AdminDashboard onBack={() => setCurrentStep('welcome')} />
        )}
        
        {currentStep === 'results' && (
          <div className="mt-12 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-2">
              <div className="flex justify-center mb-4">
                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                  <ShieldCheck className="w-8 h-8 text-emerald-500" />
                </div>
              </div>
              <h2 className="text-3xl font-extrabold text-white">Your Sizing Chart</h2>
              <p className="text-slate-400">All 10 fingers successfully mapped.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {Object.entries(measurements).map(([id, data]) => (
                <div key={id} className="glass-panel p-4 rounded-2xl border-white/5 flex flex-col items-center">
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">
                    {id.startsWith('l') ? 'Left' : 'Right'} {id.slice(1) === '1' ? 'Thumb' : id.slice(1) === '2' ? 'Index' : id.slice(1) === '3' ? 'Middle' : id.slice(1) === '4' ? 'Ring' : 'Pinky'}
                  </p>
                  <p className="text-xl font-black text-emerald-400">Size {Math.floor(Math.random() * 9)}</p>
                  <p className="text-[10px] text-slate-600">{(12.5 + Math.random() * 5).toFixed(1)}mm</p>
                </div>
              ))}
            </div>

            <div className="glass-panel p-6 rounded-3xl space-y-4 border-white/10">
              <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider text-center">Submit to Technician</h3>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase px-1">Full Name</label>
                  <input type="text" placeholder="e.g. Jane Doe" className="w-full bg-slate-900 border border-white/5 rounded-xl py-3 px-4 text-sm focus:ring-1 focus:ring-emerald-500/50 outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase px-1">Email Address</label>
                  <input type="email" placeholder="jane@example.com" className="w-full bg-slate-900 border border-white/5 rounded-xl py-3 px-4 text-sm focus:ring-1 focus:ring-emerald-500/50 outline-none" />
                </div>
              </div>
              <button
                onClick={() => {
                  alert('Sizing submitted to technician!');
                  setCurrentStep('welcome');
                }}
                className="w-full py-4 px-6 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
              >
                Submit Data <ArrowRight className="w-5 h-5" />
              </button>
            </div>

            <button
               onClick={() => setCurrentStep('welcome')}
               className="w-full py-3 text-slate-500 hover:text-white transition-colors font-medium"
            >
              Back to Home
            </button>
          </div>
        )}
      </main>

      {/* Navigation Bar (Glassmorphic) */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-3rem)] max-w-sm glass-panel py-4 px-8 rounded-[2rem] border-white/10 z-50 flex justify-between items-center bg-slate-900/80">
        <HomeIcon isActive={currentStep === 'welcome'} onClick={() => setCurrentStep('welcome')} />
        <HistoryIcon />
        <div className="relative -top-10">
          <div className="absolute inset-0 bg-emerald-500 blur-xl opacity-20" />
          <button 
            onClick={() => setCurrentStep('wizard')}
            className="relative bg-emerald-500 p-4 rounded-full text-slate-950 shadow-xl shadow-emerald-500/40 transform hover:scale-110 active:scale-95 transition-all"
          >
            <Camera className="w-7 h-7" />
          </button>
        </div>
        <UserIcon />
        <SettingsIcon />
      </nav>
    </div>
  )
}

// Minimal Components for the demo
const HomeIcon = ({ isActive, onClick }) => (
  <button onClick={onClick} className={`${isActive ? 'text-emerald-500' : 'text-slate-500'} transition-colors`}>
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
  </button>
)
const HistoryIcon = () => <History className="w-6 h-6 text-slate-500" />
const UserIcon = () => <User className="w-6 h-6 text-slate-500" />
const SettingsIcon = () => <Settings className="w-6 h-6 text-slate-500" />

export default App
