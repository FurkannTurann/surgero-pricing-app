// services/addOnsService.ts
import {
  collection,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "./firebase";
import { AddOn } from "../types/entities";

const ADDONS_COLLECTION = "addOns";

// Firestore'dan Add-on'ları oku
export async function fetchAddOnsFromFirestore(): Promise<AddOn[]> {
  const snapshot = await getDocs(collection(db, ADDONS_COLLECTION));

  return snapshot.docs.map((d) => {
    const data = d.data() as Partial<AddOn>;
    return {
      uid: (data.uid as string) || d.id, // uid yoksa doc id kullan
      name: data.name || "Untitled Add-on",
      category: data.category || "Other",
      priceType: (data.priceType as AddOn["priceType"]) || "per night",
      basePriceUsd: (data.basePriceUsd as number) || 0,
    };
  });
}

// Add-on oluştur (uid varsa o id ile setDoc, yoksa addDoc)
export async function createAddOnInFirestore(addOn: AddOn): Promise<AddOn> {
  const colRef = collection(db, ADDONS_COLLECTION);

  const { uid, ...rest } = addOn;

  // 1) Eğer elimizde geçerli bir uid varsa, onu doc id olarak kullan
  if (uid && String(uid).trim() !== "") {
    const ref = doc(db, ADDONS_COLLECTION, String(uid));
    await setDoc(ref, { uid, ...rest }, { merge: true });
    return { uid, ...rest } as AddOn;
  }

  // 2) uid yoksa: Firestore kendi id'sini üretsin
  const docRef = await addDoc(colRef, rest);
  await updateDoc(docRef, { uid: docRef.id });

  return { uid: docRef.id, ...rest } as AddOn;
}

// Add-on güncelle
export async function updateAddOnInFirestore(addOn: AddOn): Promise<void> {
  const { uid, ...rest } = addOn;
  if (!uid || String(uid).trim() === "") {
    throw new Error("updateAddOnInFirestore: uid is missing");
  }

  const ref = doc(db, ADDONS_COLLECTION, String(uid));
  await updateDoc(ref, rest);
}

// Add-on sil
export async function deleteAddOnFromFirestore(uid: string): Promise<void> {
  if (!uid || String(uid).trim() === "") {
    console.warn("[addOnsService] deleteAddOnFromFirestore called with empty uid, skipping.");
    return;
  }

  const ref = doc(db, ADDONS_COLLECTION, String(uid));
  await deleteDoc(ref);
}
