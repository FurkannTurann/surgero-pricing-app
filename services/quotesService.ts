// services/quotesService.ts
import {
  collection,
  getDocs,
  setDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "./firebase";
import { Quote } from "../types/entities";

const QUOTES_COLLECTION = "quotes";

// Firestore'dan tüm quote'ları çek
export async function fetchQuotesFromFirestore(): Promise<Quote[]> {
  const snapshot = await getDocs(collection(db, QUOTES_COLLECTION));

  return snapshot.docs.map((d) => {
    const data = d.data() as Partial<Quote>;

    // id alanını her zaman doldur (doc id fallback)
    const id = (data as any).id || d.id;

    return {
      id,
      ...data,
    } as Quote;
  });
}

// Quote'u Firestore'a kaydet / güncelle (id zorunlu)
export async function createOrUpdateQuoteInFirestore(quote: Quote): Promise<void> {
  if (!quote.id || String(quote.id).trim() === "") {
    throw new Error("createOrUpdateQuoteInFirestore: quote.id is missing");
  }

  const ref = doc(db, QUOTES_COLLECTION, String(quote.id));
  await setDoc(
    ref,
    {
      ...quote,
      id: String(quote.id),
    },
    { merge: true }
  );
}

// Firestore'dan quote sil
export async function deleteQuoteFromFirestore(id: string): Promise<void> {
  if (!id || String(id).trim() === "") {
    console.warn("[quotesService] deleteQuoteFromFirestore called with empty id, skipping.");
    return;
  }

  const ref = doc(db, QUOTES_COLLECTION, String(id));
  await deleteDoc(ref);
}
