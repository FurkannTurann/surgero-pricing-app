import { collection, getDocs, addDoc, setDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "./firebase";
import { Treatment } from "../types/entities";

const TREATMENTS_COLLECTION = "treatments";

/**
 * Prepare a Treatment object for Firestore:
 * - strip `id` (we use the document id instead)
 * - strip `combinedDiscount` (derived/optional, can be recalculated)
 * - drop any `undefined` values (Firestore does NOT allow undefined)
 */
function sanitizeTreatmentForFirestore(input: Partial<Treatment>) {
  const { id, combinedDiscount, ...rest } = input as Treatment & { combinedDiscount?: unknown };

  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

export async function fetchTreatmentsFromFirestore(): Promise<Treatment[]> {
  const snapshot = await getDocs(collection(db, TREATMENTS_COLLECTION));
  return snapshot.docs.map((d): Treatment => {
    const data = d.data() as Partial<Treatment>;
    // Safely construct the Treatment object with fallbacks for missing data.
    return {
      id: d.id,
      uid: data.uid || d.id, // Use document ID as fallback for UID
      name: data.name || 'Untitled Treatment',
      basePriceUsd: data.basePriceUsd || 0,
      department: data.department || 'Non-invasive', // Provide a valid default department
      minStay: data.minStay || 0,
      hospitalStay: data.hospitalStay || 0,
      combinedDiscount: data.combinedDiscount, // Can be undefined
      defaultDoctorCode: data.defaultDoctorCode, // Can be undefined
    };
  });
}
export async function createTreatmentInFirestore(
  input: Omit<Treatment, "id">
): Promise<Treatment> {
  const colRef = collection(db, TREATMENTS_COLLECTION);

  // 1) Save all fields except `id`
  const data = sanitizeTreatmentForFirestore(input);
  const docRef = await addDoc(colRef, data);

  // 2) Build the local Treatment object with the generated Firestore ID
  const treatment: Treatment = {
    ...(input as Treatment),
    id: docRef.id,
  };

  // 3) ALSO write the `id` field into the Firestore document,
  //    so you see it in the console and can debug easily
  await setDoc(docRef, { id: docRef.id }, { merge: true });

  return treatment;
}


export async function updateTreatmentInFirestore(
  treatment: Treatment
): Promise<void> {
  const ref = doc(db, TREATMENTS_COLLECTION, treatment.id);
  const data = sanitizeTreatmentForFirestore(treatment);
  await updateDoc(ref, data);
}

export async function deleteTreatmentFromFirestore(id: string): Promise<void> {
  console.log('[treatmentsService] deleteTreatmentFromFirestore called with id:', id);
  const ref = doc(db, TREATMENTS_COLLECTION, id);

  try {
    await deleteDoc(ref);
    console.log('[treatmentsService] deleteDoc SUCCESS for id:', id);
  } catch (error) {
    console.error('[treatmentsService] deleteDoc ERROR for id:', id, error);
    throw error;
  }
}
