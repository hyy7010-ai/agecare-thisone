import React, { useState } from "react";
import { ShieldAlert, Search, Filter, Clock, CheckCircle } from "lucide-react";
import { Resident, PendingReview } from "../types";
import { useLanguage } from "../contexts/LanguageContext";

interface DashboardProps {
  residents: Resident[];
  onResidentClick: (id: string) => void;
  onNewReport: () => void;
  canLogSirs: boolean;
  isCaregiver?: boolean;
  pendingReviews?: PendingReview[];
}

export function Dashboard({
  residents,
  onResidentClick,
  onNewReport,
  canLogSirs,
  isCaregiver,
  pendingReviews = []
}: DashboardProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const { t } = useLanguage();

  const filteredResidents = residents.filter(r => 
    r.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    r.room?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getInitials = (name: string) =>
    (name || "")
      .split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .join("")
      .substring(0, 2);

  return (
    <div className="space-y-8 font-light relative z-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-bold text-slate-800 tracking-tight font-heading">
            {t('live_dashboard') as any || "Live Dashboard"}
          </h1>
          <p className="text-slate-500 font-medium mt-2 text-base">
            {t('real_time_overview') as any || "Real-time resident wellness overview"}
          </p>
        </div>

        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={(t('find_resident') as any) || "Find resident..."}
              className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium placeholder-slate-400 text-base shadow-[0_2px_10px_rgba(0,0,0,0.02)] transition-shadow hover:shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
            />
          </div>
          {canLogSirs && (
            <button
              onClick={onNewReport}
              className="hidden md:flex items-center gap-2 px-6 py-3 bg-rose-600 text-white font-bold text-lg rounded-xl hover:bg-rose-700 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 focus:ring-4 focus:ring-rose-500/30"
            >
              <ShieldAlert className="w-6 h-6" />
              {(t('log_sirs_incident') as any) || "Log SIRS Incident"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {filteredResidents.map((resident) => (
          <button
            key={resident.id}
            onClick={() => onResidentClick(resident.id)}
            className="group block w-full text-left bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-[2rem] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] hover:border-indigo-300 hover:-translate-y-1 transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-indigo-500/30 relative overflow-hidden"
          >
            {/* Subtle gradient overlay on hover */}
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/0 to-indigo-50/0 group-hover:from-indigo-50/50 group-hover:to-white/50 transition-colors duration-500 -z-10" />
            
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-5">
                <div className="relative">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-50 to-indigo-100/50 text-indigo-700 flex items-center justify-center text-xl font-bold border border-indigo-100/50 shadow-sm shadow-indigo-100/50 group-hover:scale-105 transition-transform duration-300">
                    {getInitials(resident.name)}
                  </div>
                  <div
                    className={`absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full border-[3px] border-white shadow-sm ${
                      resident.statusColor === "red"
                        ? "bg-rose-500"
                        : resident.statusColor === "yellow"
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                    }`}
                  ></div>
                </div>
                <div>
                  <h3 className="font-bold text-2xl text-slate-800 font-heading tracking-tight group-hover:text-indigo-700 transition-colors">
                    {resident.name}
                  </h3>
                  <p className="text-sm font-medium text-slate-500 mt-1 uppercase tracking-wider">
                    Room {resident.room.replace('Room ', '')}
                  </p>
                </div>
              </div>
            </div>

            {/* Status indicators */}
            <div className="grid grid-cols-3 gap-3 mt-2 pt-4 border-t border-slate-100">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-500 uppercase font-medium tracking-wider">
                  Bath
                </span>
                <StatusBadge
                  status={
                    resident.bathStatus === "done"
                      ? "green"
                      : resident.bathStatus === "due"
                        ? "yellow"
                        : "red"
                  }
                  label={resident.bathStatus}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-500 uppercase font-medium tracking-wider">
                  Meal
                </span>
                <StatusBadge
                  status={
                    resident.mealStatus === "eaten"
                      ? "green"
                      : resident.mealStatus === "assisted"
                        ? "yellow"
                        : "red"
                  }
                  label={resident.mealStatus}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-500 uppercase font-medium tracking-wider">
                  Toilet
                </span>
                <StatusBadge
                  status={
                    resident.toiletStatus === "independent"
                      ? "green"
                      : resident.toiletStatus === "assisted"
                        ? "yellow"
                        : "red"
                  }
                  label={resident.toiletStatus}
                />
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100/60">
              <div className="flex justify-between items-end mb-3">
                <span className="text-sm text-slate-500 font-semibold tracking-wider uppercase">Care Minutes</span>
                <span className="font-bold text-slate-800 text-xl font-heading">
                  {resident.careMinutesToday} <span className="text-base text-slate-400 font-medium">/ {resident.careMinutesTarget}m</span>
                </span>
              </div>
              <div className="h-3 w-full bg-slate-100/80 rounded-full overflow-hidden shadow-inner relative">
                <div
                  className={`absolute left-0 top-0 h-full rounded-full transition-all duration-1000 ${
                    resident.careMinutesToday / resident.careMinutesTarget >= 1
                      ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]"
                      : "bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.4)]"
                  }`}
                  style={{
                    width: `${Math.min((resident.careMinutesToday / resident.careMinutesTarget) * 100, 100)}%`,
                  }}
                ></div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {isCaregiver && (
        <div className="mt-12 bg-white/80 backdrop-blur-sm rounded-3xl border border-slate-200/60 overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="bg-slate-50/50 px-8 py-6 border-b border-slate-100">
            <h2 className="text-xl font-bold text-slate-800 font-heading tracking-tight">My Submitted Observations</h2>
            <p className="text-sm text-slate-500 font-medium mt-1">Track the status of your reported notes and photos</p>
          </div>
          <div className="p-0">
            {pendingReviews.length === 0 ? (
              <div className="p-8 text-center text-slate-400 font-light text-sm">
                You have no pending observations waiting for RN review.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {pendingReviews.map((review) => (
                  <li key={review.id} className="p-6 hover:bg-slate-50 transition-colors flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                    <div>
                      <h4 className="font-medium text-slate-800">{review.residentName}</h4>
                      <p className="text-sm text-slate-500 mt-1 line-clamp-1">{review.aiResult?.observation || "Image submission"}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">
                          {new Date(review.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-sm font-medium shrink-0">
                      <Clock className="w-4 h-4" />
                      Waiting RN Review
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, label }: { status: "green" | "yellow" | "red", label: string }) {
  const colorClasses = 
    status === "green"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : status === "yellow"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-red-50 text-red-700 border-red-200";

  return (
    <div className={`px-2.5 py-1 rounded-md border text-xs font-semibold uppercase tracking-wider text-center w-full shadow-sm ${colorClasses}`}>
      {label}
    </div>
  );
}
