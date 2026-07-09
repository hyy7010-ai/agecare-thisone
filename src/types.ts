export type UserRole = "caregiver" | "rn" | "manager" | "admin" | "family";

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
}

export type HealthStatus = "green" | "yellow" | "red";
export type BathStatus = "done" | "due" | "overdue";
export type MealStatus = "eaten" | "missed" | "assisted";
export type ToiletStatus = "independent" | "assisted" | "pad-change";

export interface Resident {
  id: string;
  name: string;
  room: string;
  avatarUrl: string;
  statusColor: HealthStatus;
  bathStatus: BathStatus;
  mealStatus: MealStatus;
  toiletStatus: ToiletStatus;
  careMinutesToday: number;
  careMinutesTarget: number;
  allergies?: string[];
  medicalHistory?: string[];
  medications?: { name: string; dosage: string; frequency: string }[];
}

export interface AIObservationResult {
  observationType?: "wound" | "excrement" | "care_note";
  observation: string;
  estimatedSizeOrType?: string;
  colour?: string;
  bristolStoolType?: string;
  potentialRiskFlag: string;
  bodyLocation?: string;
  suggestedCarePlan?: string;
}

export interface SIRSReport {
  isReportable: boolean;
  category: string;
  priority: 1 | 2 | null;
  incidentTitle?: string;
  timeframe?: string;
  actWarning?: string;
  lockDowngrade?: boolean;
  residentName?: string;
  autofillReport: {
    whatHappened: string;
    immediateSafetyActions: string;
    emergencyServicesNotified: boolean;
    familyNotified: boolean;
    gpNotified: boolean;
    regulatorNotification: string;
    preventiveActions: string;
  };
  confidenceScore?: number;
  uncertaintyFlag?: string;
  groundingSources?: { title: string; uri: string }[];
  searchQueries?: string[];
}

export interface SIRSAlertData {
  priority: 1 | 2;
  message: string;
  reportInfo: SIRSReport;
  residentId?: string;
}

export interface PendingReview {
  id: string;
  residentId: string;
  residentName: string;
  room: string;
  photoUrl: string;
  aiResult: AIObservationResult;
  timestamp: string;
}
