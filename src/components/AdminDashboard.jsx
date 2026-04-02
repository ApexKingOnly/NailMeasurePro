import React, { useState } from 'react'
import { FileText, Camera, ShieldCheck, ChevronRight, Download, Eye, X, Filter, BarChart2 } from 'lucide-react'

const AdminDashboard = ({ onBack }) => {
  const [selectedOrder, setSelectedOrder] = useState(null)
  
  // Mock Data (Representing Supabase Query)
  const orders = [
    {
      id: 'NS-9812',
      customer: 'Jane Doe',
      email: 'jane@example.com',
      date: '2026-04-02',
      sizes: {
        thumbs: [1, 1],
        index: [3, 4],
        middle: [2, 2],
        ring: [4, 4],
        pinky: [7, 7]
      },
      status: 'pending',
      photo: 'https://images.unsplash.com/photo-1632345031435-81971cc5d816?auto=format&fit=crop&q=80&w=2000'
    },
    {
      id: 'NS-9811',
      customer: 'Mike Ross',
      email: 'miker@gmail.com',
      date: '2026-04-01',
      sizes: {
        thumbs: [0, 0],
        index: [2, 2],
        middle: [1, 1],
        ring: [3, 3],
        pinky: [6, 6]
      },
      status: 'verified',
      photo: 'https://images.unsplash.com/photo-1604654894611-6973b376cbde?auto=format&fit=crop&q=80&w=2000'
    }
  ]

  return (
    <div className="fixed inset-0 z-[200] bg-slate-950 text-white overflow-y-auto animate-in fade-in duration-500 pb-24">
      {/* Header */}
      <div className="sticky top-0 bg-slate-950/80 backdrop-blur-xl border-b border-white/5 px-8 py-6 z-50 flex items-center justify-between">
        <div className="flex items-center gap-4">
           <div className="bg-emerald-500/20 p-3 rounded-2xl border border-emerald-500/30">
              <ShieldCheck className="w-6 h-6 text-emerald-500" />
           </div>
           <div>
             <h2 className="text-xl font-black uppercase italic tracking-widest text-emerald-500">Admin Dashboard</h2>
             <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">Technician Control v2.0 [NailScale AI]</p>
           </div>
        </div>
        <button onClick={onBack} className="p-2 hover:bg-white/5 rounded-full transition-colors">
          <X className="w-6 h-6 text-slate-500" />
        </button>
      </div>

      <main className="px-8 mt-10 space-y-12">
        
        {/* Order Statistics */}
        <div className="grid grid-cols-2 gap-4">
           <div className="glass-panel p-6 rounded-3xl border-white/5 bg-slate-900/40">
             <div className="flex justify-between items-center mb-1">
               <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Active Orders</p>
               <BarChart2 className="w-4 h-4 text-emerald-500" />
             </div>
             <p className="text-3xl font-black text-white italic">147</p>
           </div>
           <div className="glass-panel p-6 rounded-3xl border-white/5 bg-slate-900/40">
             <div className="flex justify-between items-center mb-1">
               <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Avg Precision</p>
               <CheckCircle2 className="w-4 h-4 text-blue-500" />
             </div>
             <p className="text-3xl font-black text-white italic">99.4%</p>
           </div>
        </div>

        {/* Order List */}
        <div className="space-y-6">
           <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Incoming Scans</h3>
              <Filter className="w-5 h-5 text-slate-600 cursor-pointer" />
           </div>
           
           <div className="space-y-4">
             {orders.map(order => (
               <div 
                 key={order.id}
                 onClick={() => setSelectedOrder(order)}
                 className="group glass-panel p-6 rounded-3xl border border-white/5 bg-slate-900/20 hover:bg-slate-900/60 transition-all cursor-pointer flex items-center justify-between"
               >
                 <div className="flex items-center gap-5">
                    <div className="relative">
                       <img src={order.photo} className="w-14 h-14 rounded-2xl object-cover border border-white/10 group-hover:scale-110 transition-transform duration-500" alt="Customer" />
                       <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-950 ${order.status === 'verified' ? 'bg-emerald-500' : 'bg-orange-500 animate-pulse'}`} />
                    </div>
                    <div>
                       <h4 className="font-black text-white tracking-tight italic uppercase">{order.customer}</h4>
                       <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{order.id} • {order.date}</p>
                    </div>
                 </div>
                 <ChevronRight className="w-6 h-6 text-slate-700 group-hover:text-emerald-500 translate-x-0 group-hover:translate-x-2 transition-all" />
               </div>
             ))}
           </div>
        </div>
      </main>

      {/* Verification Modal (Full Detail View) */}
      {selectedOrder && (
        <div className="fixed inset-0 z-[300] bg-slate-950/95 backdrop-blur-2xl flex flex-col p-8 animate-in zoom-in duration-300">
           <div className="flex justify-between items-center mb-10">
              <div>
                <h2 className="text-2xl font-black uppercase italic tracking-tighter text-white">Full Sizing Analysis</h2>
                <p className="text-[10px] text-emerald-500 font-black uppercase tracking-[0.4em] mb-1">Verify AI Verification Masks</p>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="bg-white/5 p-3 rounded-2xl hover:bg-white/10 text-slate-400 transition-all">
                 <X className="w-8 h-8" />
              </button>
           </div>

           <div className="flex-1 overflow-y-auto space-y-12">
              
              {/* AI Verification Photo Overlay */}
              <div className="space-y-4">
                 <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Composite Verification Shot</h3>
                 <div className="relative rounded-[2.5rem] overflow-hidden border-2 border-white/5 bg-slate-900 group">
                    <img src={selectedOrder.photo} className="w-full h-96 object-cover opacity-60 transition-transform duration-[20s] linear animate-pulse-slow" alt="Nail Photo" />
                    
                    {/* Simulated AI Overlays (Green Rectangles for widesty horiz. span) */}
                    <div className="absolute top-1/4 left-1/3 w-8 h-12 border-2 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.5)] rounded-lg flex items-center justify-center">
                       <p className="text-[8px] bg-emerald-500 text-slate-950 font-black px-1 mt-14 rounded">14.1mm</p>
                    </div>
                    <div className="absolute top-1/3 left-1/2 w-9 h-14 border-2 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.5)] rounded-lg flex items-center justify-center">
                       <p className="text-[8px] bg-emerald-500 text-slate-950 font-black px-1 mt-16 rounded">14.9mm</p>
                    </div>
                    
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent" />
                 </div>
              </div>

              {/* Final Sizing Chart */}
              <div className="space-y-6 pb-24">
                 <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Final Sizing Record</h3>
                 <div className="grid grid-cols-2 gap-4">
                    {Object.entries(selectedOrder.sizes).map(([finger, sizes]) => (
                      <div key={finger} className="glass-panel p-6 rounded-3xl border-white/5 bg-slate-900/40">
                         <p className="text-[9px] text-slate-600 font-black uppercase tracking-widest mb-1">{finger}</p>
                         <div className="flex gap-4">
                           <div className="flex-1 bg-white/5 p-3 rounded-xl border border-white/5">
                              <p className="text-[8px] text-slate-500 font-bold uppercase mb-1">Left</p>
                              <p className="text-xl font-black text-white italic">Size {sizes[0]}</p>
                           </div>
                           <div className="flex-1 bg-white/5 p-3 rounded-xl border border-white/5">
                              <p className="text-[8px] text-slate-500 font-bold uppercase mb-1">Right</p>
                              <p className="text-xl font-black text-white italic">Size {sizes[1]}</p>
                           </div>
                         </div>
                      </div>
                    ))}
                 </div>
              </div>

           </div>

           {/* Actions (Bottom) */}
           <div className="fixed bottom-0 inset-x-0 p-8 glass-panel bg-slate-950/80 backdrop-blur-xl border-t border-white/5 flex gap-4">
              <button className="flex-1 py-5 bg-slate-900 hover:bg-slate-800 text-slate-400 font-black rounded-2xl text-xs uppercase tracking-widest border border-white/10 transition-all flex items-center justify-center gap-2">
                 <Download className="w-5 h-5" /> Export Data
              </button>
              <button className="flex-1 py-5 bg-emerald-500 text-slate-950 font-black rounded-2xl text-xs uppercase tracking-widest shadow-2xl shadow-emerald-500/30 active:scale-95 transition-all flex items-center justify-center gap-2">
                 <ShieldCheck className="w-5 h-5" /> Mark Verified
              </button>
           </div>
        </div>
      )}
    </div>
  )
}

export default AdminDashboard
