import React, { useState } from 'react'
import { ArrowLeft, User, Calendar, ExternalLink, ShieldCheck, Search, Filter } from 'lucide-react'

// Mock Data
const MOCK_ORDERS = [
  { id: 101, name: 'Jessica Smith', date: '2026-04-01', status: 'Pending', email: 'jess.s@example.com' },
  { id: 102, name: 'Michael Brown', date: '2026-03-31', status: 'Verified', email: 'm.brown@example.com' },
  { id: 103, name: 'Emily Davis', date: '2026-03-30', status: 'Shipped', email: 'emilyd@example.com' }
]

const AdminDashboard = ({ onBack }) => {
  const [selectedOrder, setSelectedOrder] = useState(null)
  
  return (
    <div className="space-y-6 pt-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">Admin Hub</h2>
      </div>

      {/* Stats Quick View */}
      <div className="grid grid-cols-2 gap-4">
        <div className="glass-panel p-4 rounded-3xl border-white/5">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">New Orders</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">12</span>
            <span className="text-[10px] text-emerald-500 font-bold">+4 Today</span>
          </div>
        </div>
        <div className="glass-panel p-4 rounded-3xl border-white/5">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Total Verified</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">482</span>
          </div>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input 
            type="text" 
            placeholder="Search name..." 
            className="w-full bg-slate-900 border border-white/5 rounded-2xl py-3 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
        <button className="p-3 bg-slate-900 border border-white/5 rounded-2xl text-slate-500 hover:text-white transition-all">
          <Filter className="w-5 h-5" />
        </button>
      </div>

      {/* Order List */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-400 px-2 uppercase tracking-wide">Recent Orders</h3>
        {MOCK_ORDERS.map((order) => (
          <button 
            key={order.id}
            onClick={() => setSelectedOrder(order)}
            className={`w-full text-left glass-panel p-5 rounded-3xl border-white/5 hover:border-emerald-500/20 transition-all flex items-center justify-between group ${
              selectedOrder?.id === order.id ? 'border-emerald-500/50 bg-emerald-500/5' : ''
            }`}
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/50 border border-white/5 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <User className="w-6 h-6 text-slate-400" />
              </div>
              <div className="space-y-0.5">
                <p className="font-bold text-slate-100">{order.name}</p>
                <div className="flex items-center gap-3 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  <Calendar className="w-3 h-3" />
                  <span>{order.date}</span>
                </div>
              </div>
            </div>
            
            <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              order.status === 'Verified' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'
            }`}>
              {order.status}
            </div>
          </button>
        ))}
      </div>

      {/* Order Detail Modal (Simple Overlay) */}
      {selectedOrder && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center px-4 pb-8 pointer-events-none">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm pointer-events-auto" onClick={() => setSelectedOrder(null)} />
          <div className="relative w-full max-w-sm glass-panel rounded-[2rem] p-8 border-white/10 pointer-events-auto animate-in slide-in-from-bottom-full duration-500">
            <div className="flex justify-between items-start mb-6">
              <div className="space-y-1">
                <h2 className="text-2xl font-bold">{selectedOrder.name}</h2>
                <p className="text-sm text-emerald-500 font-medium">#{selectedOrder.id}</p>
              </div>
              <div className="p-3 bg-emerald-500/10 rounded-2xl">
                <ShieldCheck className="w-6 h-6 text-emerald-500" />
              </div>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="bg-slate-900 border border-white/5 p-4 rounded-2xl">
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Left Thumb</p>
                  <p className="text-xl font-black">Size 0</p>
                  <p className="text-[10px] text-slate-600">17.2mm</p>
                </div>
                <div className="bg-slate-900 border border-white/5 p-4 rounded-2xl">
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Left Index</p>
                  <p className="text-xl font-black">Size 5</p>
                  <p className="text-[10px] text-slate-600">13.8mm</p>
                </div>
              </div>

              <button className="w-full py-4 px-6 bg-slate-100 hover:bg-white text-slate-950 font-bold rounded-2xl transition-all flex items-center justify-center gap-2">
                <Search className="w-5 h-5" />
                View Verification Photos
              </button>
              
              <button 
                onClick={() => setSelectedOrder(null)}
                className="w-full py-3 px-6 text-slate-400 font-medium hover:text-white transition-all"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminDashboard
