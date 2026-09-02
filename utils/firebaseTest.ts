import { db } from "../services/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

/**
 * Writes a test document to the 'connectionTests' collection in Firestore
 * to verify the frontend-backend connection is working.
 *
 * Returns the created document ID if successful.
 */
export const testFirebaseConnection = async (): Promise<string> => {
  console.log("🔄 Running Firestore connection test...");

  try {
    const payload = {
      createdAt: serverTimestamp(),
      source: "surgero-price-calculator",
      env: (import.meta as any).env?.MODE || "unknown",
    };

    const docRef = await addDoc(collection(db, "connectionTests"), payload);

    console.log("✅ Firestore test write OK. Document ID:", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("⚠️ Firestore test write FAILED:", error);
    throw error;
  }
};
