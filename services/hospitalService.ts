import { db } from './firebase';
import { collection, getDocs, addDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { Hospital } from '../types/entities';

const COLLECTION_NAME = 'hospitals';

// Hastaneleri Getir
export const fetchHospitals = async (): Promise<Hospital[]> => {
  try {
    const q = query(collection(db, COLLECTION_NAME), orderBy('name', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name,
    }));
  } catch (error) {
    console.error("Failed to fetch hospitals:", error);
    return [];
  }
};

// Hastane Ekle
export const addHospitalToFirestore = async (name: string): Promise<Hospital> => {
  const docRef = await addDoc(collection(db, COLLECTION_NAME), { name });
  return { id: docRef.id, name };
};

// Hastane Sil
export const deleteHospitalFromFirestore = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, COLLECTION_NAME, id));
};