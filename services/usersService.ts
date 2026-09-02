// src/services/usersService.ts

import { db } from './firebase';
import { collection, getDocs, doc, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { User, UserRole } from '../types/entities';

/**
 * Admin paneli için tüm kullanıcıları veritabanından çeker.
 */
export const fetchUsersFromFirestore = async (): Promise<User[]> => {
  try {
    const snapshot = await getDocs(collection(db, 'users'));
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
          ...data,
          uid: doc.id // Doküman ID'sini UID olarak garantiye alıyoruz
      } as User;
    });
  } catch (error) {
    console.error("[UsersService] Kullanıcı listesi çekilemedi:", error);
    return [];
  }
};

/**
 * Admin panelinden bir kullanıcının rolünü günceller.
 */
export const updateUserRoleInFirestore = async (uid: string, role: UserRole): Promise<void> => {
  if (!uid) return;
  try {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, { role });
    console.log(`[UsersService] Rol güncellendi: ${role}`);
  } catch (error) {
    console.error("[UsersService] Rol güncelleme hatası:", error);
    throw error;
  }
};

/**
 * 🔥 KRİTİK FONKSİYON: Kullanıcı giriş yaptığında veritabanına kaydeder.
 * Adminlerde 'doctorCode' undefined olduğu için oluşan hatayı önler.
 */
export const syncUserToFirestore = async (user: User): Promise<void> => {
  if (!user.uid) return;
  
  const userRef = doc(db, 'users', user.uid);
  
  // 1. Kullanıcı objesinin bir kopyasını alıyoruz (Orijinal state bozulmasın diye)
  const cleanUser = { ...user };

  // 2. TEMİZLİK: Firebase 'undefined' değer kabul etmez.
  // Eğer doctorCode tanımsızsa, bu alanı objeden tamamen siliyoruz.
  if (cleanUser.doctorCode === undefined) {
    delete (cleanUser as any).doctorCode;
  }
  
  // Ekstra Güvenlik: Başka undefined alan varsa onları da temizle
  Object.keys(cleanUser).forEach(key => {
    if ((cleanUser as any)[key] === undefined) {
      delete (cleanUser as any)[key];
    }
  });

  try {
    const userSnap = await getDoc(userRef);

    // Kullanıcı yoksa sıfırdan oluştur, varsa üzerine yaz (merge)
    if (!userSnap.exists()) {
      await setDoc(userRef, cleanUser);
    } else {
      await setDoc(userRef, cleanUser, { merge: true });
    }
    
    console.log("[UsersService] Kullanıcı başarıyla senkronize edildi:", user.email);
  } catch (error) {
    // Hata olsa bile uygulamayı kırma, sadece logla.
    console.error("[UsersService] Kullanıcı senkronizasyon hatası:", error);
  }
};