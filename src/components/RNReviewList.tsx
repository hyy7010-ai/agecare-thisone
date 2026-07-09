import React, { useState } from "react";
import {
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  Edit3,
  ImageOff,
  FileText,
  Mic,
} from "lucide-react";
import { PendingReview } from "../types";

interface RNReviewListProps {
  onBack: () => void;
  pendingReviews: PendingReview[];
  onConfirmReview: (id: string) => void;
}

export function RNReviewList({
  onBack,
  pendingReviews,
  onConfirmReview,
}: RNReviewListProps) {
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);

  const selectedReview = pendingReviews.find((r) => r.id === selectedReviewId);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={selectedReviewId ? () => setSelectedReviewId(null) : onBack}
          className="p-2 hover:bg-slate-200 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <h1 className="text-2xl font-medium tracking-tight text-slate-800">
          RN Review Pending Queue
        </h1>
      </div>

      {!selectedReviewId ? (
        // List View
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          {pendingReviews.length === 0 ? (
            <div className="p-16 text-center text-slate-500 font-light text-lg">
              No pending observations require RN review.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {pendingReviews.map((review) => (
                <div
                  key={review.id}
                  onClick={() => setSelectedReviewId(review.id)}
                  className="p-6 hover:bg-slate-50 transition-colors cursor-pointer flex items-center gap-6"
                >
                  {review.photoUrl ? (
                    <img
                      src={review.photoUrl}
                      alt="Observation"
                      className="w-20 h-20 rounded-xl object-cover border border-slate-200 shrink-0"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-indigo-50 border border-indigo-100 shrink-0 flex flex-col items-center justify-center text-indigo-600">
                      {review.aiResult.observationType === "care_note" ? (
                        <FileText className="w-6 h-6 mb-1 text-indigo-500 animate-pulse" />
                      ) : (
                        <ImageOff className="w-6 h-6 mb-1 opacity-50" />
                      )}
                      <span className="text-[9px] uppercase tracking-wider font-medium text-center">
                        {review.aiResult.observationType === "care_note" ? "Care Note" : "No Image"}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-slate-800">
                        {review.residentName}
                      </span>
                      <span className="text-sm font-light text-slate-500">
                        ({review.room})
                      </span>
                      <span className="ml-2 text-xs font-medium uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                        {review.aiResult.observationType || "General"}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 font-light truncate mb-2">
                      {review.aiResult.observation}
                    </p>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-slate-400">
                        {new Date(review.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {review.aiResult.potentialRiskFlag && (
                        <span className="text-amber-600 font-medium flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {review.aiResult.potentialRiskFlag}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : selectedReview ? (
        // Detail / Review view
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Left panel: Photo or voice visualization */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 overflow-hidden shadow-sm">
            {selectedReview.photoUrl ? (
              <img
                src={selectedReview.photoUrl}
                alt="Captured observation"
                className="w-full rounded-xl object-cover max-h-[500px]"
              />
            ) : selectedReview.aiResult.observationType === "care_note" ? (
              <div className="space-y-6">
                <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="p-3 bg-indigo-50 rounded-lg text-indigo-600">
                    <Mic className="w-6 h-6 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="font-medium text-slate-800">Caregiver Voice Intake</h3>
                    <p className="text-xs text-slate-500">Transcribed and clinical note compiled by AI</p>
                  </div>
                </div>
                
                {/* Audio Waveform Graphic */}
                <div className="flex items-end justify-between h-20 px-4 bg-slate-50 rounded-xl border border-slate-100/60 py-4">
                  {[35, 60, 45, 75, 20, 85, 40, 55, 90, 65, 30, 70, 50, 80, 45, 60, 35, 55, 70, 40].map((h, i) => (
                    <div 
                      key={i} 
                      className="w-1.5 bg-indigo-400 rounded-full" 
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>

                {selectedReview.aiResult.suggestedCarePlan && (
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                      Native Confirmation Retranslation
                    </span>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm text-slate-600 leading-relaxed italic font-light">
                      "{selectedReview.aiResult.suggestedCarePlan}"
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full h-64 rounded-xl bg-slate-50 flex flex-col items-center justify-center text-slate-400 border border-dashed border-slate-200">
                <ImageOff className="w-12 h-12 mb-2 opacity-30" />
                <span className="text-sm font-medium">No Image Available</span>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="bg-white border rounded-2xl border-slate-200 overflow-hidden shadow-sm">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h2 className="text-lg font-medium text-slate-800 mb-1">
                  {selectedReview.residentName}
                </h2>
                <p className="text-sm text-slate-500 font-light">
                  Room {selectedReview.room} •{" "}
                  {selectedReview.aiResult.observationType}
                </p>
              </div>
              <span className="text-xs font-medium uppercase tracking-wider bg-teal-100 text-teal-800 px-2 py-1 rounded">
                Needs RN Sign-off
              </span>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <span className="block text-xs font-normal text-slate-400 uppercase mb-2">
                  Visual Observation
                </span>
                <p className="bg-slate-50 p-4 rounded-lg border border-slate-100 text-sm text-slate-700 leading-relaxed font-light">
                  {selectedReview.aiResult.observation}
                </p>
              </div>

              {selectedReview.aiResult.observationType === "excrement" ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="block text-xs font-normal text-slate-400 uppercase mb-2">
                        Colour
                      </span>
                      <p className="bg-slate-50 p-3 rounded-lg border border-slate-100 font-normal text-sm text-slate-700">
                        {selectedReview.aiResult.colour || "N/A"}
                      </p>
                    </div>
                    <div>
                      <span className="block text-xs font-normal text-slate-400 uppercase mb-2">
                        Bristol Stool Type
                      </span>
                      <p className="bg-slate-50 p-3 rounded-lg border border-slate-100 font-normal text-sm text-slate-700">
                        {selectedReview.aiResult.bristolStoolType || "N/A"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <span className="block text-xs font-normal text-slate-400 uppercase mb-2">
                      Potential Risk Flag
                    </span>
                    <p className="bg-amber-50 text-amber-700 p-3 rounded-lg border border-amber-100 font-normal text-sm">
                      {selectedReview.aiResult.potentialRiskFlag}
                    </p>
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="block text-xs font-normal text-slate-400 uppercase mb-2">
                        Size / Type Estimate
                      </span>
                      <p className="bg-slate-50 p-3 rounded-lg border border-slate-100 font-normal text-sm text-slate-700">
                        {selectedReview.aiResult.estimatedSizeOrType}
                      </p>
                    </div>
                    <div>
                      <span className="block text-xs font-normal text-slate-400 uppercase mb-2">
                        Potential Risk Flag
                      </span>
                      <p className="bg-amber-50 text-amber-700 p-3 rounded-lg border border-amber-100 font-normal text-sm">
                        {selectedReview.aiResult.potentialRiskFlag}
                      </p>
                    </div>
                  </div>
                  {selectedReview.aiResult.bodyLocation && (
                    <div>
                      <span className="block text-xs font-normal text-slate-400 uppercase mb-2">
                        Location
                      </span>
                      <p className="bg-slate-50 p-3 rounded-lg border border-slate-100 font-normal text-sm text-slate-700">
                        {selectedReview.aiResult.bodyLocation}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {selectedReview.aiResult.suggestedCarePlan && (
                <div className="mt-4">
                  <span className="block text-xs font-normal text-slate-400 uppercase mb-2">
                    AI Suggested Care Plan (Aged Care Guidelines)
                  </span>
                  <div className="bg-indigo-50 text-indigo-800 p-4 rounded-xl border border-indigo-100 font-medium text-sm whitespace-pre-wrap leading-relaxed shadow-sm">
                    {selectedReview.aiResult.suggestedCarePlan}
                  </div>
                </div>
              )}

              <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col gap-4">
                <p className="text-xs text-slate-400 text-center font-light">
                  AI observation, not a medical diagnosis. RN confirmation
                  required.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button className="py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
                    <Edit3 className="w-4 h-4" />
                    Add Note / Override
                  </button>
                  <button
                    onClick={() => {
                      onConfirmReview(selectedReview.id);
                      setSelectedReviewId(null);
                    }}
                    className="py-3 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Confirm & Save to Record
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
