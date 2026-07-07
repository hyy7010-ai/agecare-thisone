import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  AlertTriangle,
  Lock,
  ShieldCheck,
  Clock,
  Users,
  XOctagon,
} from "lucide-react";
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

interface Shift {
  id: string;
  day: string;
  shiftType: "Day" | "Evening" | "Night";
  time: string;
  rnCount: number;
  pwCount: number;
}

interface RosterComplianceGuardProps {
  onBack: () => void;
}

export function RosterComplianceGuard({ onBack }: RosterComplianceGuardProps) {
  const [shifts, setShifts] = useState<Shift[]>([]);

  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [editRnCount, setEditRnCount] = useState(0);
  const [editPwCount, setEditPwCount] = useState(0);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "shifts"), (snapshot) => {
      const data: Shift[] = [];
      snapshot.forEach((doc) => {
        data.push({ ...doc.data(), id: doc.id } as Shift);
      });
      setShifts(data);
    });
    return () => unsub();
  }, []);

  const handleEditClick = (shift: Shift) => {
    setEditingShiftId(shift.id);
    setEditRnCount(shift.rnCount);
    setEditPwCount(shift.pwCount);
  };

  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingShiftId) {
      const shiftRef = doc(db, "shifts", editingShiftId);
      await updateDoc(shiftRef, {
        rnCount: editRnCount,
        pwCount: editPwCount,
      });
      setEditingShiftId(null);
    }
  };

  const breaches = shifts.filter((shift) => shift.rnCount === 0);
  const hasRnBreach = breaches.length > 0;

  const averageCareMinutes = hasRnBreach ? 205 : 216;
  const targetCareMinutes = 215;
  const isCareMinutesCompliant = averageCareMinutes >= targetCareMinutes;

  const averageRnMinutes = hasRnBreach ? 40 : 45;
  const targetRnMinutes = 44;
  const isRnMinutesCompliant = averageRnMinutes >= targetRnMinutes;

  const days = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  const shiftTypes = ["Day", "Evening", "Night"];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-200 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h1 className="text-2xl font-medium tracking-tight text-slate-800">
            Roster Compliance Guard
          </h1>
        </div>
        <div className="flex gap-3">
          <button
            disabled={hasRnBreach || !isCareMinutesCompliant}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-colors ${
              hasRnBreach || !isCareMinutesCompliant
                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-teal-600 hover:bg-teal-700 text-white shadow-sm"
            }`}
          >
            {hasRnBreach || !isCareMinutesCompliant ? (
              <>
                <Lock className="w-4 h-4" /> Save Roster
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" /> Save Roster
              </>
            )}
          </button>
        </div>
      </div>

      {/* Blocking Banners */}
      {hasRnBreach && (
        <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-start gap-4">
          <XOctagon className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-red-800 font-bold tracking-tight">
              ⚠️ Aged Care Act breach: No Registered Nurse coverage
            </h3>
            <div className="text-red-700 text-sm mt-1 space-y-1">
              {breaches.map((b) => (
                <p key={b.id}>
                  Missing RN for{" "}
                  <strong>
                    {b.day} {b.shiftType}
                  </strong>{" "}
                  shift ({b.time}).
                </p>
              ))}
              <p className="mt-2 font-medium">
                This facility is at risk of regulatory sanction. The roster
                cannot be saved until coverage is secured.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Care Minutes Widget */}
        <div className="lg:col-span-1 border border-slate-200 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-base font-medium tracking-tight text-slate-800 mb-6 flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" /> Care Minutes Target
          </h2>

          <div className="space-y-6">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-500">
                  Average Total Care Minutes
                </span>
                <span
                  className={
                    isCareMinutesCompliant
                      ? "text-slate-800 font-medium"
                      : "text-red-600 font-bold"
                  }
                >
                  {averageCareMinutes} / {targetCareMinutes} mins
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${isCareMinutesCompliant ? "bg-teal-500" : "bg-red-500"}`}
                  style={{
                    width: `${Math.min(100, (averageCareMinutes / targetCareMinutes) * 100)}%`,
                  }}
                />
              </div>
              {!isCareMinutesCompliant && (
                <p className="text-xs text-red-600 font-medium mt-2">
                  Below mandated {targetCareMinutes} care minutes —
                  non-compliant
                </p>
              )}
            </div>

            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-500">Of which RN Minutes</span>
                <span
                  className={
                    isRnMinutesCompliant
                      ? "text-slate-800 font-medium"
                      : "text-red-600 font-bold"
                  }
                >
                  {averageRnMinutes} / {targetRnMinutes} mins
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${isRnMinutesCompliant ? "bg-teal-500" : "bg-red-500"}`}
                  style={{
                    width: `${Math.min(100, (averageRnMinutes / targetRnMinutes) * 100)}%`,
                  }}
                />
              </div>
              {!isRnMinutesCompliant && (
                <p className="text-xs text-red-600 font-medium mt-2">
                  Below mandated {targetRnMinutes} RN minutes — non-compliant
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 24/7 RN Summary */}
        <div className="lg:col-span-2 border border-slate-200 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-base font-medium tracking-tight text-slate-800 mb-6 flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-400" /> 24/7 RN Coverage Status
          </h2>
          <div className="flex items-center gap-8">
            <div className="flex-1">
              <div className="text-3xl font-light text-slate-800 tracking-tight">
                {shifts.length - breaches.length}{" "}
                <span className="text-base text-slate-500 font-normal">
                  / {shifts.length} shifts covered
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-2">
                The Aged Care Act requires at least one Registered Nurse on-site
                and on duty at all times.
              </p>
            </div>
            {hasRnBreach ? (
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
            ) : (
              <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-8 h-8 text-teal-600" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Roster Grid */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h2 className="text-base font-medium tracking-tight text-slate-800">
            Weekly Roster View
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-medium">Day</th>
                {shiftTypes.map((type) => (
                  <th key={type} className="px-6 py-4 font-medium">
                    {type} Shift
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {days.map((day) => (
                <tr key={day} className="hover:bg-slate-50/50">
                  <td className="px-6 py-4 font-medium text-slate-800 border-r border-slate-100">
                    {day}
                  </td>
                  {shiftTypes.map((type) => {
                    const shift = shifts.find(
                      (s) => s.day === day && s.shiftType === type,
                    );
                    if (!shift)
                      return <td key={type} className="px-6 py-4"></td>;

                    const isBreach = shift.rnCount === 0;

                    return (
                      <td
                        key={type}
                        className={`px-4 py-4 border-r last:border-r-0 border-slate-100 ${isBreach && editingShiftId !== shift.id ? "bg-red-50" : ""}`}
                      >
                        {editingShiftId === shift.id ? (
                          <form onSubmit={handleSaveShift} className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-slate-500 w-12">RNs:</label>
                              <input
                                type="number"
                                min="0"
                                value={editRnCount}
                                onChange={(e) => setEditRnCount(parseInt(e.target.value) || 0)}
                                className="w-16 px-2 py-1 text-sm border border-slate-300 rounded"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-slate-500 w-12">Care:</label>
                              <input
                                type="number"
                                min="0"
                                value={editPwCount}
                                onChange={(e) => setEditPwCount(parseInt(e.target.value) || 0)}
                                className="w-16 px-2 py-1 text-sm border border-slate-300 rounded"
                              />
                            </div>
                            <div className="flex gap-2 mt-1">
                              <button type="submit" className="px-2 py-1 bg-teal-600 text-white text-xs rounded hover:bg-teal-700">Save</button>
                              <button type="button" onClick={() => setEditingShiftId(null)} className="px-2 py-1 bg-slate-200 text-slate-700 text-xs rounded hover:bg-slate-300">Cancel</button>
                            </div>
                          </form>
                        ) : (
                          <div className="flex flex-col gap-1.5 group cursor-pointer" onClick={() => handleEditClick(shift)}>
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-slate-400 font-mono">
                                {shift.time}
                              </span>
                              <span className="text-xs text-teal-600 opacity-0 group-hover:opacity-100 transition-opacity">Edit</span>
                            </div>
                            <div
                              className={`flex items-center gap-1.5 font-medium ${isBreach ? "text-red-700" : "text-teal-700"}`}
                            >
                              {isBreach ? (
                                <AlertTriangle className="w-3.5 h-3.5" />
                              ) : (
                                <ShieldCheck className="w-3.5 h-3.5" />
                              )}
                              {shift.rnCount} RNs{" "}
                              {isBreach && (
                                <span className="text-xs text-red-600 ml-1 uppercase tracking-wider">
                                  (Breach)
                                </span>
                              )}
                            </div>
                            <div className="text-slate-500 text-xs">
                              {shift.pwCount} Care Workers
                            </div>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
