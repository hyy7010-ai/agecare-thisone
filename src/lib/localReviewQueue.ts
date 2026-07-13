// Local (browser) fallback for the RN review queue.
//
// The demo login accounts are not real Firebase sessions (anonymous auth is
// disabled on the project), so Firestore writes are permission-denied. Without
// a fallback, a caregiver's "Submit for RN review" fails and the RN never sees
// the item, breaking the cross-role demo. When a Firestore write fails we mirror
// the payload here so the whole caregiver -> RN flow works end to end in one
// browser. In a real deployment with real auth, Firestore succeeds and this
// store stays empty.

import { collection, addDoc } from "firebase/firestore";
import { db, auth } from "./firebase";

const KEY = "demo_rnReviewQueue";
const EVENT = "local-review-queue-changed";

export interface LocalReview {
  id: string;
  __local: true;
  [k: string]: any;
}

function read(): LocalReview[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function write(items: LocalReview[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  // Notify listeners in this tab (the native "storage" event only fires in
  // OTHER tabs, so we also dispatch a same-tab custom event).
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function addLocalReview(payload: Record<string, any>): LocalReview {
  const items = read();
  const item: LocalReview = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    __local: true,
    ...payload,
  };
  items.push(item);
  write(items);
  return item;
}

export function getLocalReviews(): LocalReview[] {
  return read();
}

export function removeLocalReview(id: string) {
  write(read().filter((r) => r.id !== id));
}

// Single entry point for submitting an item to the RN review queue.
// Firestore with offline persistence resolves addDoc optimistically even when
// the server later rejects the write (permission denied), so we cannot rely on
// addDoc throwing. Instead we detect demo mode explicitly: demo logins are not
// real Firebase sessions (auth.currentUser is null), so those writes can never
// reach the server -> route them straight to the local queue. Real authenticated
// sessions go to Firestore.
export async function submitReview(payload: Record<string, any>): Promise<void> {
  if (!auth?.currentUser) {
    addLocalReview(payload);
    return;
  }
  try {
    await addDoc(collection(db, "rnReviewQueue"), payload);
  } catch (e) {
    console.warn("Firestore review write failed, using local queue", e);
    addLocalReview(payload);
  }
}

export function subscribeLocalReviews(cb: (items: LocalReview[]) => void): () => void {
  const handler = () => cb(read());
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
