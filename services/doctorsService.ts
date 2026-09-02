// src/services/doctorsService.ts
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { Doctor, Department, DEPARTMENTS } from '../types/entities';

const USERS_COLLECTION = 'users';

/**
 * Firestore'dan role = "Doctor" olan kullanıcıları çekip
 * Doctor tipine çevirir.
 */
export async function fetchDoctorsFromFirestore(): Promise<Doctor[]> {
  const usersRef = collection(db, USERS_COLLECTION);
  const q = query(usersRef, where('role', '==', 'Doctor'));
  const snapshot = await getDocs(q);

  const doctors: Doctor[] = snapshot.docs.map((docSnap) => {
    const data = docSnap.data() as any;

    let departments: Department[] = DEPARTMENTS;
    if (Array.isArray(data.departments) && data.departments.length > 0) {
      const valid = data.departments.filter((d: string) =>
        DEPARTMENTS.includes(d as Department)
      );
      if (valid.length > 0) {
        departments = valid as Department[];
      }
    }

    const doctor: Doctor = {
      uid: docSnap.id,
      name: data.name || 'Unnamed Doctor',
      code: data.doctorCode || data.doctorcode || data.code || docSnap.id,
      priceMultiplier:
        typeof data.priceMultiplier === 'number' && data.priceMultiplier > 0
          ? data.priceMultiplier
          : 1,
      departments,
      isActive: data.isActive !== undefined ? !!data.isActive : true,
    };

    return doctor;
  });

  doctors.sort((a, b) => a.name.localeCompare(b.name));
  return doctors;
}

/**
 * Belirli bir doktorun Firestore'daki priceMultiplier değerini günceller.
 * doctorUid → users koleksiyonundaki doc id
 */
export async function updateDoctorInFirestore(
  doctorUid: string,
  priceMultiplier: number
): Promise<void> {
  const safeMultiplier =
    Number.isFinite(priceMultiplier) && priceMultiplier > 0
      ? priceMultiplier
      : 1;

  const userDocRef = doc(db, USERS_COLLECTION, doctorUid);
  await updateDoc(userDocRef, {
    priceMultiplier: safeMultiplier,
  });
}
