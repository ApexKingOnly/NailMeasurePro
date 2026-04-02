import React, { useState, useEffect } from 'react'
import { Camera, ShieldCheck, History, Settings, User, CreditCard, ArrowRight, CheckCircle2 } from 'lucide-react'
import SizingWizard from './components/SizingWizard'
import AdminDashboard from './components/AdminDashboard'
import { mmToSize } from './utils/sizing' 

function App() {
  const [currentStep, setCurrentStep] = useState('welcome') // welcome, wizard, admin, results
  const [finalData, setFinalData] = useState({})
  
  // Handlers
  const handleWizardFinish = (photos) => {
    // In a real app, this is where AI processing would occur
    // For the UI, we simulate the results
    setFinalData({
      photos,
      measurements: {
        "Left Thumb": 16.5, "Right Thumb": 16.5,
        "Left Index": 14.2, "Right Index": 14.1,
        "Left Middle": 15.0, "Right Middle": 14.9,
        "Left Ring": 13.8, "Right Ring": 13.7,
        "Left Pinky": 10.5, "Right Pinky": 10.4
      }
    })
    setCurrentStep('results')
  }

  return (
    <div className="min-h-screen bg-slate-950 font-sans selection:bg-emerald-500/30 selection:text-emerald-200 overflow-hidden">
      {/* Background Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/10 blur-[120px]" />
      </div>

      <main className="relative z-10 max-w-md mx-auto px-6 pt-12 pb-32">
        {currentStep === 'welcome' && (
          <div className="space-y-10 animate-in fade-in duration-700">
            <div className="flex justify-center">
              <div className="p-5 rounded-[2rem] bg-gradient-to-br from-emerald-500/20 to-blue-500/20 border border-white/10 shadow-2xl glass-panel relative group">
                <div className="absolute -inset-1 bg-emerald-500/30 rounded-[2rem] blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <Camera className="w-16 h-16 text-emerald-400 relative" />
              </div>
            </div>
            
            <div className="text-center">
              <h1 className="text-5xl font-black tracking-tight text-white mb-2 italic">
                NailScale <span className="text-emerald-500">AI</span>
              </h1>
              <p className="text-slate-400 text-lg leading-relaxed font-medium">
                High-Precision Vision Sizing 💍💅 [BUILD-CHECK-LIVE]
              </p>
            </div>

            <div className="glass-panel p-8 rounded-[2.5rem] space-y-6 border-white/5 bg-slate-900/40">
              <h3 className="text-xs font-black text-emerald-500 uppercase tracking-[0.3em] text-center">Protocol: 3-Shot Composite</h3>
              <div className="space-y-4">
                {[
                  { icon: "👈", text: "Left Hand (4 fingers + Dime)" },
                  { icon: "👉", text: "Right Hand (4 fingers + Dime)" },
                  { icon: "👍", text: "Both Thumbs (together + Dime)" }
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-4 text-slate-300 bg-white/5 p-4 rounded-2xl border border-white/5">
                    <span className="text-xl">{item.icon}</span>
                    <span className="text-sm font-semibold">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => setCurrentStep('wizard')}
              className="w-full py-5 px-6 bg-emerald-500 text-slate-950 font-black rounded-[2rem] transition-all transform active:scale-95 shadow-2xl shadow-emerald-500/20 uppercase tracking-widest text-sm"
            >
              Initialize Scan
            </button>
            
            <button
              onClick={() => setCurrentStep('admin')}
              className="w-full py-4 px-6 bg-slate-900/50 hover:bg-slate-800 text-slate-400 font-bold rounded-2xl border border-white/5 transition-all text-xs tracking-widest uppercase"
            >
              Admin Dashboard
            </button>
          </div>
        )}

        {currentStep === 'wizard' && (
          <SizingWizard 
            onFinish={handleWizardFinish}
            onCancel={() => setCurrentStep('welcome')}
          />
        )}

        {currentStep === 'admin' && (
          <AdminDashboard onBack={() => setCurrentStep('welcome')} />
        )}
        
        {currentStep === 'results' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
            <div className="text-center space-y-3">
              <div className="flex justify-center mb-6">
                <div className="p-4 rounded-3xl bg-emerald-500/10 border border-emerald-500/30">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                </div>
              </div>
              <h2 className="text-4xl font-black text-white italic">Scan Complete</h2>
              <p className="text-emerald-500/80 font-bold uppercase tracking-widest text-[10px]">Measurements Optimized (+1mm Buffer)</p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(finalData.measurements).map(([id, mm]) => (
                  <div key={id} className="glass-panel p-5 rounded-3xl border-white/5 flex flex-col items-center bg-slate-900/60">
                    <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.2em] mb-2">{id}</p>
                    <p className="text-2xl font-black text-emerald-400 italic">Size {mmToSize(mm + 1)}</p>
                    <p className="text-[9px] text-slate-600 font-bold">{(mm + 1).toFixed(1)}mm Width</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-panel p-10 rounded-[3rem] space-y-6 border-white/10 bg-gradient-to-b from-slate-900 to-slate-950">
              <h3 className="text-xs font-black text-slate-300 uppercase tracking-[0.4em] text-center">Secure Submission</h3>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-600 uppercase px-2 tracking-widest">Full Name</label>
                  <input type="text" placeholder="e.g. Jane Doe" className="w-full bg-slate-900/80 border border-white/5 rounded-2xl py-4 px-6 text-sm focus:ring-1 focus:ring-emerald-500/50 outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-600 uppercase px-2 tracking-widest">Email Address</label>
                  <input type="email" placeholder="jane@example.com" className="w-full bg-slate-900/80 border border-white/5 rounded-2xl py-4 px-6 text-sm focus:ring-1 focus:ring-emerald-500/50 outline-none" />
                </div>
              </div>
              <button
                onClick={() => {
                  alert('Sizing submitted to Technician Dashboard!');
                  setCurrentStep('welcome');
                }}
                className="w-full py-5 px-6 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-2xl transition-all shadow-2xl shadow-emerald-500/30 flex items-center justify-center gap-3 tracking-widest uppercase text-xs"
              >
                Submit Sizing <ArrowRight className="w-5 h-5" />
              </button>
            </div>

            <button
               onClick={() => setCurrentStep('welcome')}
               className="w-full py-4 text-slate-600 hover:text-white transition-colors font-black uppercase tracking-[0.3em] text-[10px]"
            >
              Abandon Scan
            </button>
          </div>
        )}
      </main>

      {/* Modern NavBar (Floating) */}
      <nav className="fixed bottom-10 left-1/2 -translate-x-1/2 w-[calc(100%-4rem)] max-w-sm glass-panel py-6 px-10 rounded-full border-white/10 z-50 flex justify-between items-center bg-slate-900/90 shadow-2xl">
        <HomeIcon isActive={currentStep === 'welcome'} onClick={() => setCurrentStep('welcome')} />
        <HistoryIcon />
        <div className="relative">
          <div className="absolute -inset-3 bg-emerald-500 blur-2xl opacity-20" />
          <button 
            onClick={() => setCurrentStep('wizard')}
            className="relative bg-emerald-500 p-5 rounded-full text-slate-950 shadow-2xl shadow-emerald-500/40 transform hover:scale-125 active:scale-90 transition-all border-4 border-slate-950"
          >
            <Camera className="w-8 h-8" />
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
  <button onClick={onClick} className={`${isActive ? 'text-emerald-500' : 'text-slate-500'} transition-all hover:scale-110`}>
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
  </button>
)
const HistoryIcon = () => <History className="w-6 h-6 text-slate-500 hover:text-white transition-colors" />
const UserIcon = () => <User className="w-6 h-6 text-slate-500 hover:text-white transition-colors" />
const SettingsIcon = () => <Settings className="w-6 h-6 text-slate-500 hover:text-white transition-colors" />

export default App
