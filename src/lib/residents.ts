import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { mockResidents } from "../data";

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const isPermissionDenied = error instanceof Error && error.message.includes("Missing or insufficient permissions");
  if (isPermissionDenied && !auth.currentUser) {
    console.log("Ignored expected permission error during logout.");
    return;
  }
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface FirestoreResident {
  id?: string;
  name: string;
  room: string;
  careMinutes: number;
  status: string;
  allergies: string[];
  medicalHistory?: string[];
  medications?: { name: string; dosage: string; frequency: string }[];
  basicCareTasks: {
    bath: boolean;
    meal: boolean;
    toilet: boolean;
  };
}

const COLLECTION_NAME = "residents";

export async function getResidents(): Promise<FirestoreResident[]> {
  try {
    const snap = await getDocs(collection(db, COLLECTION_NAME));
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FirestoreResident));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, COLLECTION_NAME);
    return [];
  }
}

export async function getResident(id: string): Promise<FirestoreResident | null> {
  try {
    const d = await getDoc(doc(db, COLLECTION_NAME, id));
    if (!d.exists()) return null;
    return { id: d.id, ...d.data() } as FirestoreResident;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${COLLECTION_NAME}/${id}`);
    return null;
  }
}

export async function addResident(data: Omit<FirestoreResident, "id">): Promise<string> {
  try {
    const ref = await addDoc(collection(db, COLLECTION_NAME), data);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, COLLECTION_NAME);
    return "";
  }
}

export async function updateResident(id: string, data: Partial<FirestoreResident>): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTION_NAME, id), data as any);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${COLLECTION_NAME}/${id}`);
  }
}

export async function deleteResident(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, COLLECTION_NAME, id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${COLLECTION_NAME}/${id}`);
  }
}

export async function updateBasicCareTask(id: string, task: "bath" | "meal" | "toilet", value: boolean) {
  try {
    await updateDoc(doc(db, COLLECTION_NAME, id), {
      [`basicCareTasks.${task}`]: value
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${COLLECTION_NAME}/${id}`);
    throw error;
  }
}

export async function updateAdlStatuses(id: string, adlUpdates: { bathStatus?: string; mealStatus?: string; toiletStatus?: string }) {
  try {
    const updates: any = {};
    if (adlUpdates.bathStatus) updates["basicCareTasks.bath"] = adlUpdates.bathStatus === "done";
    if (adlUpdates.mealStatus) updates["basicCareTasks.meal"] = adlUpdates.mealStatus === "eaten";
    if (adlUpdates.toiletStatus) updates["basicCareTasks.toilet"] = adlUpdates.toiletStatus === "independent";
    
    if (Object.keys(updates).length > 0) {
      await updateDoc(doc(db, COLLECTION_NAME, id), updates);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${COLLECTION_NAME}/${id}`);
    throw error;
  }
}

export async function updateCareMinutes(id: string, minutes: number) {
  try {
    await updateDoc(doc(db, COLLECTION_NAME, id), {
      careMinutesToday: minutes
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${COLLECTION_NAME}/${id}`);
    throw error;
  }
}

export function subscribeResidents(callback: (residents: FirestoreResident[]) => void, onError?: (err: Error) => void) {
  return onSnapshot(
    collection(db, COLLECTION_NAME),
    (snapshot) => {
      const residents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FirestoreResident));
      callback(residents);
    },
    (error) => {
      // Always surface subscription errors so the UI can stop its loading state
      // and fall back to demo data. handleFirestoreError swallows permission
      // errors when signed out (demo mode uses local auth, so currentUser is
      // null), which previously left the dashboard spinner stuck forever.
      console.warn("subscribeResidents error:", (error as Error)?.message);
      if (onError) onError(error as unknown as Error);
    }
  );
}

let isSeeding = false;

export async function seedResidentsIfEmpty(onError?: (e: Error) => void) {
  if (isSeeding) return;
  isSeeding = true;
  try {
    const existing = await getResidents();
    if (existing.length === 0) {
      console.log("Seeding residents from mock data...");
      for (const m of mockResidents) {
        // map mock target to new schema
        const newData: Omit<FirestoreResident, "id"> = {
          name: m.name,
          room: m.room,
          careMinutes: m.careMinutesToday || 0,
          status: m.statusColor,
          allergies: [],
          basicCareTasks: {
            bath: m.bathStatus === "done",
            meal: m.mealStatus === "eaten",
            toilet: m.toiletStatus === "independent",
          }
        };
        await addResident(newData);
      }
    }
  } catch (error) {
    console.warn("Error seeding residents:", error);
    if (onError) onError(error as Error);
  } finally {
    isSeeding = false;
  }
}
