import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { SIRSAlertData } from '../types';
import { ShieldAlert, CheckCircle, Clock, AlertTriangle, ChevronRight, X } from 'lucide-react';

interface SirsEvent extends SIRSAlertData {
  id: string;
  timestamp: any;
  status: 'pending' | 'acknowledged' | 'submitted';
  category?: string;
  reporterName?: string;
  description?: string;
}

export function SirsReviewDashboard({ onBack }: { onBack: () => void }) {
  const [events, setEvents] = useState<SirsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<SirsEvent | null>(null);
  
  useEffect(() => {
    const q = query(collection(db, "sirsEvents"), orderBy("timestamp", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: SirsEvent[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as SirsEvent);
      });
      setEvents(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, "sirsEvents", id), {
        status: newStatus
      });
      if (selectedEvent && selectedEvent.id === id) {
        setSelectedEvent({ ...selectedEvent, status: newStatus as any });
      }
    } catch (e) {
      console.error("Failed to update status", e);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-8 h-8 text-red-600" />
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">SIRS Management Hub</h1>
            <p className="text-slate-500 mt-1">Review and action reported serious incidents (ACQSC Compliance)</p>
          </div>
        </div>
        <button 
          onClick={onBack}
          className="text-sm font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-lg transition-colors"
        >
          Back to Dashboard
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* List View */}
        <div className="col-span-1 lg:col-span-1 border border-slate-200 rounded-2xl bg-white overflow-hidden flex flex-col h-[700px]">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
            <h3 className="font-bold text-slate-700">Incident Reports ({events.length})</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="p-4 text-center text-slate-500">Loading incidents...</div>
            ) : events.length === 0 ? (
              <div className="p-4 text-center text-slate-500">No SIRS reports found.</div>
            ) : (
              <div className="space-y-2">
                {events.map(ev => (
                  <button 
                    key={ev.id}
                    onClick={() => setSelectedEvent(ev)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      selectedEvent?.id === ev.id 
                        ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500' 
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        ev.priority === 1 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                        Priority {ev.priority}
                      </span>
                      {ev.status === 'submitted' ? (
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                      ) : ev.status === 'acknowledged' ? (
                        <Clock className="w-4 h-4 text-amber-500" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                      )}
                    </div>
                    <div className="font-medium text-slate-900 text-sm mb-1 truncate">
                      {ev.reportInfo?.category || ev.category || 'Incident Report'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {ev.timestamp?.toDate ? new Date(ev.timestamp.toDate()).toLocaleString() : 'Just now'}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Detail View */}
        <div className="col-span-1 lg:col-span-2 border border-slate-200 rounded-2xl bg-white flex flex-col h-[700px] overflow-hidden">
          {selectedEvent ? (
            <div className="flex-1 overflow-y-auto">
              <div className={`p-6 border-b ${
                selectedEvent.priority === 1 ? 'bg-red-50 border-red-100' : 'bg-orange-50 border-orange-100'
              }`}>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-1">{selectedEvent.reportInfo?.category || selectedEvent.category || 'Incident Report'}</h2>
                    <p className="text-slate-600 font-medium">Reported by {selectedEvent.reporterName || 'Staff'}</p>
                  </div>
                  <span className={`text-sm font-bold px-3 py-1 rounded-full ${
                    selectedEvent.priority === 1 ? 'bg-red-600 text-white' : 'bg-orange-500 text-white'
                  }`}>
                    Priority {selectedEvent.priority}
                  </span>
                </div>
                <div className="flex gap-2">
                  <div className="bg-white/60 px-3 py-1 rounded-md text-sm font-medium border border-white">
                    Due: {selectedEvent.reportInfo?.timeframe || (selectedEvent.priority === 1 ? '24 Hours' : '30 Days')}
                  </div>
                  <div className="bg-white/60 px-3 py-1 rounded-md text-sm font-medium border border-white capitalize">
                    Status: {selectedEvent.status || 'Pending Review'}
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Original Narrative</h3>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-slate-700 whitespace-pre-wrap">
                    {selectedEvent.description || selectedEvent.message || selectedEvent.reportInfo?.autofillReport?.whatHappened}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">AI Compliance Analysis</h3>
                  <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                    <p className="text-indigo-900 font-medium whitespace-pre-wrap">{selectedEvent.reportInfo?.uncertaintyFlag || 'High confidence classification based on ACQSC guidelines.'}</p>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Required Actions</h3>
                  <ul className="space-y-2">
                    {[selectedEvent.reportInfo?.autofillReport?.immediateSafetyActions, selectedEvent.reportInfo?.autofillReport?.preventiveActions, selectedEvent.reportInfo?.autofillReport?.regulatorNotification].filter(Boolean).map((action, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <ChevronRight className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                        <span className="text-slate-700">{action}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-6 border-t border-slate-200 flex justify-end gap-3">
                  {selectedEvent.status !== 'submitted' && (
                    <>
                      <button 
                        onClick={() => handleStatusChange(selectedEvent.id, 'acknowledged')}
                        className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                      >
                        Acknowledge (In Progress)
                      </button>
                      <button 
                        onClick={() => handleStatusChange(selectedEvent.id, 'submitted')}
                        className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors flex items-center gap-2 shadow-sm"
                      >
                        <CheckCircle className="w-5 h-5" /> Submit to ACQSC Portal
                      </button>
                    </>
                  )}
                  {selectedEvent.status === 'submitted' && (
                    <div className="px-6 py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold rounded-xl flex items-center gap-2">
                      <CheckCircle className="w-5 h-5" /> Officially Submitted to Commission
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
              <ShieldAlert className="w-16 h-16 mb-4 text-slate-200" />
              <h3 className="text-xl font-bold text-slate-500 mb-2">Select an Incident</h3>
              <p>Choose an incident from the list to review details, AI analysis, and take official action.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
