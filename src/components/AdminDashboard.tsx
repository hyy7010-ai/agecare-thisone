import React, { useState } from 'react';
import { Shield, Users, Activity, Settings, UserPlus, Clock, TrendingUp, AlertTriangle, CheckCircle, BarChart3, Map } from 'lucide-react';
import { Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';

export function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'analytics' | 'users' | 'audit'>('analytics');

  const mockUsers = [
    { id: 1, name: 'Sarah Jenkins', role: 'Caregiver', status: 'Active', lastLogin: '2 mins ago' },
    { id: 2, name: 'Emily Chen', role: 'RN', status: 'Active', lastLogin: '1 hour ago' },
    { id: 3, name: 'Michael Thompson', role: 'Manager', status: 'Active', lastLogin: '3 hours ago' },
    { id: 4, name: 'Sarah Connor', role: 'Caregiver', status: 'Offline', lastLogin: 'Yesterday' },
  ];

  const mockAuditLogs = [
    { id: 101, user: 'Emily Chen', action: 'Confirmed Observation', target: 'Eleanor Vance', time: '10 mins ago', type: 'clinical' },
    { id: 102, user: 'Sarah Jenkins', action: 'Submitted Care Note', target: 'James O\'Connor', time: '25 mins ago', type: 'clinical' },
    { id: 103, user: 'Michael Thompson', action: 'Modified Shift Roster', target: 'System', time: '1 hour ago', type: 'system' },
    { id: 104, user: 'System Admin', action: 'Invited User (Sarah Connor)', target: 'System', time: '2 days ago', type: 'admin' },
  ];

  const careMinutesData = [
    { name: 'Mon', required: 200, actual: 210 },
    { name: 'Tue', required: 200, actual: 195 },
    { name: 'Wed', required: 200, actual: 205 },
    { name: 'Thu', required: 200, actual: 220 },
    { name: 'Fri', required: 200, actual: 215 },
    { name: 'Sat', required: 200, actual: 190 },
    { name: 'Sun', required: 200, actual: 198 },
  ];

  const riskHeatmapData = [
    { zone: 'Bathroom (Wing A)', incidents: 12, risk: 'High' },
    { zone: 'Dining Hall', incidents: 4, risk: 'Low' },
    { zone: 'Garden Pathway', incidents: 8, risk: 'Medium' },
    { zone: 'Bathroom (Wing B)', incidents: 9, risk: 'Medium' },
    { zone: 'Lounge Area', incidents: 2, risk: 'Low' },
    { zone: 'Corridor C', incidents: 5, risk: 'Medium' },
  ];

  return (
    <div className="max-w-7xl mx-auto py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-8 h-8 text-indigo-600" />
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Executive Dashboard</h1>
            <p className="text-slate-500 font-medium mt-1">Facility insights, compliance metrics, and risk analysis</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm font-medium text-slate-500 bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm">
          <Clock className="w-4 h-4" />
          <span>Last updated: Just now</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="border-b border-slate-200 flex overflow-x-auto hide-scrollbar">
          <button
            onClick={() => setActiveTab('analytics')}
            className={`whitespace-nowrap px-6 py-4 text-sm font-bold transition-colors border-b-2 ${
              activeTab === 'analytics' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Data Analytics
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`whitespace-nowrap px-6 py-4 text-sm font-bold transition-colors border-b-2 ${
              activeTab === 'users' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            User Management
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`whitespace-nowrap px-6 py-4 text-sm font-bold transition-colors border-b-2 ${
              activeTab === 'audit' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Audit Logs
          </button>
        </div>

        <div className="p-6 bg-slate-50">
          {activeTab === 'analytics' ? (
            <div className="space-y-6">
              {/* KPIs */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-start justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-500 mb-1">Missed Reporting Risks</p>
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-3xl font-black text-slate-900">3</h3>
                      <span className="text-sm font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" /> +1 this week
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">Potential unlogged SIRS events</p>
                  </div>
                  <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-start justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-500 mb-1">Care Mins Compliance</p>
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-3xl font-black text-slate-900">96.8%</h3>
                      <span className="text-sm font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Target met
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">Required: 200 mins/resident</p>
                  </div>
                  <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                    <Activity className="w-5 h-5 text-emerald-600" />
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-start justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-500 mb-1">Total SIRS Submitted</p>
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-3xl font-black text-slate-900">12</h3>
                      <span className="text-sm font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" /> YTD
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">All successfully submitted</p>
                  </div>
                  <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                    <Shield className="w-5 h-5 text-indigo-600" />
                  </div>
                </div>
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Chart 1 */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-indigo-500" /> Care Minutes Trend
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={careMinutesData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        />
                        <Legend iconType="circle" />
                        <Area type="monotone" dataKey="actual" name="Actual Mins" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorActual)" />
                        <Area type="monotone" dataKey="required" name="Required (200)" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" fill="none" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Heatmap/Bar Chart */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Map className="w-5 h-5 text-orange-500" /> High-Risk Area Heatmap
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={riskHeatmapData} layout="vertical" margin={{ top: 0, right: 30, left: 40, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                        <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                        <YAxis dataKey="zone" type="category" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 11, fontWeight: 500 }} />
                        <Tooltip
                          cursor={{fill: '#f1f5f9'}}
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        />
                        <Bar dataKey="incidents" name="Incidents Recorded" radius={[0, 4, 4, 0]}>
                          {
                            riskHeatmapData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.risk === 'High' ? '#ef4444' : entry.risk === 'Medium' ? '#f59e0b' : '#10b981'} />
                            ))
                          }
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'users' ? (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 className="font-bold text-slate-700">System Users</h3>
                <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors flex items-center gap-2">
                  <UserPlus className="w-4 h-4" /> Invite User
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-white text-slate-500 font-medium border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4">User Name</th>
                      <th className="px-6 py-4">Role</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Last Login</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {mockUsers.map(u => (
                      <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-bold text-slate-800">{u.name}</td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                            u.role === 'Admin' || u.role === 'Manager' ? 'bg-indigo-100 text-indigo-700' : 
                            u.role === 'RN' ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="flex items-center gap-1.5 font-medium text-slate-600">
                            <span className={`w-2 h-2 rounded-full ${u.status === 'Active' ? 'bg-green-500' : 'bg-slate-300'}`}></span>
                            {u.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-500 font-medium">{u.lastLogin}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-100 bg-slate-50">
                <h3 className="font-bold text-slate-700">Security & Audit Logs</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-white text-slate-500 font-medium border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4">Time</th>
                      <th className="px-6 py-4">User</th>
                      <th className="px-6 py-4">Action</th>
                      <th className="px-6 py-4">Target</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {mockAuditLogs.map(log => (
                      <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 text-slate-500 flex items-center gap-1.5 font-medium">
                          <Clock className="w-4 h-4 text-slate-400" /> {log.time}
                        </td>
                        <td className="px-6 py-4 font-bold text-slate-700">{log.user}</td>
                        <td className="px-6 py-4 text-slate-600 font-medium">{log.action}</td>
                        <td className="px-6 py-4 text-slate-500">{log.target}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

