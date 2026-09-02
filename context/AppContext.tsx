// src/context/AppContext.tsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from 'react';
import {
  User,
  Treatment,
  AddOn,
  Quote,
  Page,
  Doctor,
  QuoteDoctorComment,
  UserRole,
  QuoteDerivedValues,
  Hospital,
} from '../types/entities';
import {
  loadFromStorage,
  saveToStorage,
  removeFromStorage,
} from '../store/localStorage';
import { STORAGE_KEYS } from '../constants';
import { seedTreatments, seedAddOns, seedDoctors } from '../store/seed';
import { generateUUID } from '../utils/helpers';

// Services
import {
  fetchTreatmentsFromFirestore,
  createTreatmentInFirestore,
  updateTreatmentInFirestore,
  deleteTreatmentFromFirestore,
} from '../services/treatmentsService';

import {
  fetchAddOnsFromFirestore,
  createAddOnInFirestore,
  updateAddOnInFirestore,
  deleteAddOnFromFirestore,
} from '../services/addOnsService';

import {
  fetchQuotesFromFirestore,
  createOrUpdateQuoteInFirestore,
  deleteQuoteFromFirestore,
} from '../services/quotesService';

import {
  fetchDoctorsFromFirestore,
  updateDoctorInFirestore,
} from '../services/doctorsService';

import {
  fetchUsersFromFirestore,
  updateUserRoleInFirestore,
  syncUserToFirestore
} from '../services/usersService';

import { 
  fetchHospitals, 
  addHospitalToFirestore, 
  deleteHospitalFromFirestore 
} from '../services/hospitalService';

import { logAudit } from '../services/auditService';

import { db } from '../services/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
} from 'firebase/firestore';

interface AppContextType {
  currentUser: User | null;
  users: User[];
  treatments: Treatment[];
  addOns: AddOn[];
  quotes: Quote[];
  doctors: Doctor[];
  hospitals: Hospital[];
  page: Page;
  quoteToDuplicate: Quote | null;
  notification: { message: string; type: 'success' | 'error' } | null;

  login: (user: Omit<User, 'uid'>) => void;
  logout: () => void;
  setPage: (page: Page) => void;
  addTreatment: (treatment: Omit<Treatment, 'uid' | 'id'>) => void;
  updateTreatment: (treatment: Treatment) => void;
  deleteTreatment: (id: string) => void;
  deleteMultipleTreatments: (ids: string[]) => void;
  addAddOn: (addOn: Omit<AddOn, 'uid'>) => void;
  updateAddOn: (addOn: AddOn) => void;
  deleteAddOn: (uid: string) => void;
  addQuote: (quote: Quote) => void;
  deleteQuote: (id: string) => void;
  duplicateQuote: (quote: Quote) => void;
  updateUserRole: (email: string, role: User['role']) => void;
  addDoctorComment: (quoteId: string, commentText: string) => void;
  showNotification: (message: string, type?: 'success' | 'error') => void;
  updateDoctorPriceMultiplier: (doctorUid: string, multiplier: number) => Promise<void>;
  
  addHospital: (name: string) => void;
  deleteHospital: (id: string) => void;

  // ✅ YENİ: Doctors listesini dışarıdan güncellemek için gerekli
  setDoctors: React.Dispatch<React.SetStateAction<Doctor[]>>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(() =>
    loadFromStorage(STORAGE_KEYS.CURRENT_USER, null)
  );
  const [users, setUsers] = useState<User[]>(() =>
    loadFromStorage(STORAGE_KEYS.USERS, [])
  );
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [addOns, setAddOns] = useState<AddOn[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  
  // ✅ DÜZELTME 1: Başlangıçta LocalStorage'dan oku (Boş array yerine)
  const [doctors, setDoctors] = useState<Doctor[]>(() => 
    loadFromStorage(STORAGE_KEYS.DOCTORS, [])
  );
  
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [page, setPage] = useState<Page>('calculator');
  const [quoteToDuplicate, setQuoteToDuplicate] = useState<Quote | null>(null);
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  const withDerivedDefaults = (quote: Quote): Quote => {
    const defaultDerived: QuoteDerivedValues = {
      totalBaseUsd: 0,
      totalAfterDoctorAdjUsd: 0,
      totalAfterDiscountUsd: 0,
      totalAddOnsUsd: 0,
      subtotalUsd: 0,
      vatUsd: 0,
      grandTotalUsd: 0,
      depositUsd: 0,
      balanceUsd: 0,
      totalHotelNights: 0,
      totalHospitalNights: 0,
    };

    return {
      ...quote,
      derived: {
        ...defaultDerived,
        ...(quote.derived || {}),
      },
    };
  };

  // ✅ DÜZELTME 2: Custom Setter - Her değişiklikte LocalStorage'ı da güncelle
  const setDoctorsWithSync: React.Dispatch<React.SetStateAction<Doctor[]>> = useCallback((value) => {
    setDoctors((prevDoctors) => {
      const newDoctors = typeof value === 'function' 
        ? (value as (prev: Doctor[]) => Doctor[])(prevDoctors) 
        : value;
      
      // EKRAN GÜNCELLENİRKEN LOCAL STORAGE'I DA GÜNCELLE
      saveToStorage(STORAGE_KEYS.DOCTORS, newDoctors);
      return newDoctors;
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      // 0) USERS
      try {
        const remoteUsers = await fetchUsersFromFirestore();
        if (isMounted && remoteUsers.length > 0) {
          setUsers(remoteUsers);
          saveToStorage(STORAGE_KEYS.USERS, remoteUsers);
        } else if (isMounted) {
          const localUsers = loadFromStorage<User[]>(STORAGE_KEYS.USERS, []);
          if (localUsers.length > 0) {
            setUsers(localUsers);
          }
        }
      } catch (error) {
        console.error('Failed to load users from Firestore', error);
      }

      // 1) TREATMENTS
      try {
        const remoteTreatments = await fetchTreatmentsFromFirestore();
        if (isMounted && remoteTreatments.length > 0) {
          setTreatments(remoteTreatments);
          saveToStorage(STORAGE_KEYS.TREATMENTS, remoteTreatments);
        } else if (isMounted) {
          const localTreatments = loadFromStorage<Treatment[]>(
            STORAGE_KEYS.TREATMENTS,
            []
          );
          if (localTreatments.length === 0) {
            const seededWithIds = seedTreatments.map((t) => ({
              ...t,
              id: t.uid,
            }));
            saveToStorage(STORAGE_KEYS.TREATMENTS, seededWithIds);
            setTreatments(seededWithIds);
          } else {
            setTreatments(localTreatments);
          }
        }
      } catch (error) {
        console.error(
          'Failed to load treatments from Firestore, falling back to local data',
          error
        );
        if (isMounted) {
          const localTreatments = loadFromStorage<Treatment[]>(
            STORAGE_KEYS.TREATMENTS,
            seedTreatments.map((t) => ({ ...t, id: t.uid }))
          );
          setTreatments(localTreatments);
        }
      }

      // 2) ADD-ONS
      try {
        const remoteAddOns = await fetchAddOnsFromFirestore();

        if (isMounted && remoteAddOns.length > 0) {
          setAddOns(remoteAddOns);
          saveToStorage(STORAGE_KEYS.ADDONS, remoteAddOns);
        } else if (isMounted) {
          const localAddOns = loadFromStorage<AddOn[]>(
            STORAGE_KEYS.ADDONS,
            []
          );
          const sourceAddOns =
            localAddOns.length > 0 ? localAddOns : seedAddOns;

          setAddOns(sourceAddOns);
          saveToStorage(STORAGE_KEYS.ADDONS, sourceAddOns);

          if (sourceAddOns.length > 0) {
            for (const addOn of sourceAddOns) {
              try {
                await createAddOnInFirestore(addOn);
              } catch (e) {
                console.error(
                  '[AppContext] Failed to seed add-ons to Firestore:',
                  e
                );
              }
            }
          }
        }
      } catch (error) {
        console.error(
          'Failed to load add-ons from Firestore, falling back to local data',
          error
        );
        if (isMounted) {
          const fallbackAddOns = loadFromStorage<AddOn[]>(
            STORAGE_KEYS.ADDONS,
            seedAddOns
          );
          setAddOns(fallbackAddOns);
        }
      }

      // 3) DOCTORS - ✅ DÜZELTME 3: NETWORK-FIRST YAKLAŞIMI
      // Burada eski karmaşık mantığı sildik. Doğrudan Firebase'den çekip,
      // verileri State ve LocalStorage'a ZORLA yazıyoruz.
      try {
        // Servis katmanını bypass edip direkt collection çekiyoruz ki mapping hatası olmasın
        const snapshot = await getDocs(collection(db, 'doctors'));
        const remoteDoctors = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                uid: doc.id, // UID kesinlikle doküman ID'sidir
                id: doc.id,
                name: data.name || '',
                email: data.email || '',
                code: data.code || '',
                departments: data.departments || [], // Departman arrayini garantiye al
                priceMultiplier: data.priceMultiplier || 1,
                isActive: data.isActive ?? true,
                imageUrl: data.imageUrl || null,
                color: data.color || '#10b981'
            } as Doctor;
        });

        if (isMounted) {
          console.log("🔥 Doctors Synced from Firebase (Count):", remoteDoctors.length);
          setDoctors(remoteDoctors);
          // Firebase verisini Diske Kaydet (Overwrite)
          saveToStorage(STORAGE_KEYS.DOCTORS, remoteDoctors);
        }
      } catch (error) {
        console.error(
          'Failed to load doctors from Firestore',
          error
        );
      }

      // 4) QUOTES
      try {
        const remoteQuotesRaw = await fetchQuotesFromFirestore();
        const remoteQuotes = remoteQuotesRaw.map(withDerivedDefaults);

        if (isMounted && remoteQuotes.length > 0) {
          setQuotes(remoteQuotes);
          saveToStorage(STORAGE_KEYS.QUOTES, remoteQuotes);
        } else if (isMounted) {
          const localQuotesRaw = loadFromStorage<Quote[]>(
            STORAGE_KEYS.QUOTES,
            []
          );
          const localQuotes = localQuotesRaw.map(withDerivedDefaults);
          setQuotes(localQuotes);
        }
      } catch (error) {
        console.error(
          'Failed to load quotes from Firestore, falling back to local data',
          error
        );
        if (isMounted) {
          const fallbackRaw = loadFromStorage<Quote[]>(
            STORAGE_KEYS.QUOTES,
            []
          );
          const fallbackQuotes = fallbackRaw.map(withDerivedDefaults);
          setQuotes(fallbackQuotes);
        }
      }

      // 5) HOSPITALS
      try {
        const remoteHospitals = await fetchHospitals();
        if (isMounted) setHospitals(remoteHospitals);
      } catch (error) {
        console.error('Failed to load hospitals', error);
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  const showNotification = useCallback(
    (message: string, type: 'success' | 'error' = 'success') => {
      setNotification({ message, type });
      setTimeout(() => setNotification(null), 3000);
    },
    []
  );

  const updateDoctorPriceMultiplier = async (
    doctorUid: string,
    multiplier: number
  ): Promise<void> => {
    if (!currentUser || currentUser.role !== 'Admin') {
      showNotification('Only Admins can update doctor sale prices.', 'error');
      return;
    }

    const safeMultiplier =
      Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;

    try {
      await updateDoctorInFirestore(doctorUid, safeMultiplier);

      // ✅ setDoctorsWithSync KULLANILDI
      setDoctorsWithSync((prev) => {
        const updated = prev.map((d) =>
          d.uid === doctorUid ? { ...d, priceMultiplier: safeMultiplier } : d
        );
        return updated;
      });

      showNotification('Doctor sale price multiplier updated.', 'success');
      logAudit('Update Doctor', `Updated markup for doctor ${doctorUid}`, currentUser.email, 'User');
    } catch (error) {
      console.error(
        '[AppContext] Failed to update doctor price multiplier in Firestore:',
        error
      );
      showNotification(
        'Failed to update doctor sale price. Please try again.',
        'error'
      );
    }
  };

  const login = async (userData: Omit<User, 'uid'>) => {
    const existingUsers = loadFromStorage<User[]>(STORAGE_KEYS.USERS, []);
    let userIndex = existingUsers.findIndex((u) => u.email === userData.email);
    let loggedInUser: User;

    let doctorProfile: Doctor | undefined;
    if (userData.role === 'Doctor') {
      doctorProfile = doctors.find(
        (d) => d.name.toLowerCase() === userData.name.toLowerCase()
      );
    }

    const completeUserData: Omit<User, 'uid'> = {
      ...userData,
      doctorCode: doctorProfile ? doctorProfile.code : undefined,
    };

    if (userIndex > -1) {
      const foundUser = existingUsers[userIndex];
      loggedInUser = {
        ...foundUser,
        ...completeUserData,
        uid: foundUser.uid || generateUUID(),
      };
    } else {
      loggedInUser = { ...completeUserData, uid: generateUUID() };
    }

    try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', userData.email));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            const firestoreUser = snapshot.docs[0].data() as User;
            const userDocRef = snapshot.docs[0].ref;

            if (firestoreUser.isActive === false) {
                showNotification("Access Denied: Your account has been suspended by Admin.", "error");
                return;
            }

            const now = new Date().toISOString();
            await updateDoc(userDocRef, { lastLoginAt: now });
            
            loggedInUser = { 
                ...loggedInUser, 
                ...firestoreUser, 
                uid: firestoreUser.uid || loggedInUser.uid,
                lastLoginAt: now 
            };
        } else {
            await syncUserToFirestore(loggedInUser);
        }

        logAudit("Login", `User logged in: ${loggedInUser.email}`, loggedInUser.email, "System");

    } catch (error) {
        console.error("Login Check Error:", error);
    }

    if (userIndex > -1) {
        existingUsers[userIndex] = loggedInUser;
    } else {
        existingUsers.push(loggedInUser);
    }

    setUsers(existingUsers);
    saveToStorage(STORAGE_KEYS.USERS, existingUsers);

    setCurrentUser(loggedInUser);
    saveToStorage(STORAGE_KEYS.CURRENT_USER, loggedInUser);

    setPage('calculator');
  };

  const logout = () => {
    setCurrentUser(null);
    removeFromStorage(STORAGE_KEYS.CURRENT_USER);
  };

  const persistAndUpdate =
    <T extends { id: string } | { uid: string }>(
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      key: string
    ) =>
    (updater: (prev: T[]) => T[]) => {
      setter((prev) => {
        const newState = updater(prev);
        saveToStorage(key, newState);
        return newState;
      });
    };

  // -----------------------------
  // TREATMENTS
  // -----------------------------
  const addTreatment = (treatmentData: Omit<Treatment, 'uid' | 'id'>) => {
    if (currentUser?.role === 'Doctor') {
      showNotification(
        'You do not have permission to add treatments.',
        'error'
      );
      return;
    }

    const tempUid = generateUUID();
    const tempTreatment: Treatment = {
      ...treatmentData,
      uid: tempUid,
      id: tempUid,
    };

    persistAndUpdate(setTreatments, STORAGE_KEYS.TREATMENTS)((prev) => [
      ...prev,
      tempTreatment,
    ]);
    showNotification('Treatment added successfully.');

    (async () => {
      try {
        const savedTreatment = await createTreatmentInFirestore({
          ...treatmentData,
          uid: tempUid,
        });

        persistAndUpdate(setTreatments, STORAGE_KEYS.TREATMENTS)((prev) =>
          prev.map((t) =>
            t.uid === tempUid || t.id === tempUid ? savedTreatment : t
          )
        );
      } catch (error) {
        console.error('Failed to create treatment in Firestore:', error);
        showNotification('Failed to save treatment to the cloud.', 'error');

        persistAndUpdate(setTreatments, STORAGE_KEYS.TREATMENTS)((prev) =>
          prev.filter((t) => t.uid !== tempUid && t.id !== tempUid)
        );
      }
    })();
  };

  const updateTreatment = (updatedTreatment: Treatment) => {
    if (currentUser?.role === 'Doctor') {
      showNotification(
        'You do not have permission to update treatments.',
        'error'
      );
      return;
    }

    persistAndUpdate(setTreatments, STORAGE_KEYS.TREATMENTS)((prev) =>
      prev.map((t) => (t.id === updatedTreatment.id ? updatedTreatment : t))
    );
    showNotification('Treatment updated successfully.');

    (async () => {
      try {
        await updateTreatmentInFirestore(updatedTreatment);
      } catch (error) {
        console.error('Failed to update treatment in Firestore:', error);
        showNotification('Failed to update treatment in the cloud.', 'error');
      }
    })();
  };

  const deleteTreatment = (idOrUid: string) => {
    console.log('[AppContext] deleteTreatment called with:', idOrUid);

    let firestoreId: string | null = null;

    setTreatments((prev) => {
      const found = prev.find((t) => t.id === idOrUid || t.uid === idOrUid);

      if (!found) {
        console.warn('[AppContext] No treatment found for key:', idOrUid);
        return prev;
      }

      firestoreId = found.id;

      const next = prev.filter((t) => t.id !== found.id);
      return next;
    });

    if (!firestoreId) {
      console.warn(
        '[AppContext] firestoreId is null, skipping Firestore delete.'
      );
      return;
    }

    (async () => {
      try {
        await deleteTreatmentFromFirestore(firestoreId);
        console.log(
          '[AppContext] Firestore delete completed for:',
          firestoreId
        );
      } catch (error) {
        console.error(
          '[AppContext] Failed to delete treatment in Firestore:',
          error
        );
        showNotification('Failed to delete treatment in the cloud.', 'error');
      }
    })();
  };

  const deleteMultipleTreatments = (idsOrUids: string[]) => {
    if (!idsOrUids || idsOrUids.length === 0) return;
    console.log(
      '[AppContext] deleteMultipleTreatments called with:',
      idsOrUids
    );

    let firestoreIds: string[] = [];

    setTreatments((prev) => {
      const next = prev.filter((t) => {
        const match =
          idsOrUids.includes(t.id) || idsOrUids.includes(t.uid);
        if (match) {
          firestoreIds.push(t.id);
        }
        return !match;
      });

      return next;
    });

    if (firestoreIds.length === 0) {
      console.warn(
        '[AppContext] No Firestore ids resolved in bulk delete. Skipping Firestore delete.'
      );
      return;
    }

    (async () => {
      for (const fireId of firestoreIds) {
        try {
          await deleteTreatmentFromFirestore(fireId);
        } catch (error) {
          console.error(
            `[AppContext] Failed to delete treatment ${fireId} in Firestore (bulk):`,
            error
          );
        }
      }
    })();
  };

  // -----------------------------
  // ADD-ONS
  // -----------------------------
  const addAddOn = (addOnData: Omit<AddOn, 'uid'>) => {
    if (currentUser?.role === 'Doctor') {
      showNotification('You do not have permission to add add-ons.', 'error');
      return;
    }

    const tempUid = generateUUID();
    const tempAddOn: AddOn = { ...addOnData, uid: tempUid };

    persistAndUpdate(setAddOns, STORAGE_KEYS.ADDONS)((prev) => [
      ...prev,
      tempAddOn,
    ]);
    showNotification('Add-on added successfully.');

    (async () => {
      try {
        const savedAddOn = await createAddOnInFirestore(addOnData);

        persistAndUpdate(setAddOns, STORAGE_KEYS.ADDONS)((prev) =>
          prev.map((a) => (a.uid === tempUid ? savedAddOn : a))
        );
      } catch (error) {
        console.error(
          '[AppContext] Failed to create add-on in Firestore:',
          error
        );
        showNotification('Failed to save add-on to the cloud.', 'error');

        persistAndUpdate(setAddOns, STORAGE_KEYS.ADDONS)((prev) =>
          prev.filter((a) => a.uid !== tempUid)
        );
      }
    })();
  };

  const updateAddOn = (updatedAddOn: AddOn) => {
    if (currentUser?.role === 'Doctor') {
      showNotification(
        'You do not have permission to update add-ons.',
        'error'
      );
      return;
    }

    persistAndUpdate(setAddOns, STORAGE_KEYS.ADDONS)((prev) =>
      prev.map((a) => (a.uid === updatedAddOn.uid ? updatedAddOn : a))
    );
    showNotification('Add-on updated successfully.');

    (async () => {
      try {
        await updateAddOnInFirestore(updatedAddOn);
      } catch (error) {
        console.error(
          '[AppContext] Failed to update add-on in Firestore:',
          error
        );
        showNotification('Failed to update add-on in the cloud.', 'error');
      }
    })();
  };

  // ✅ DÜZELTİLDİ: deleteAddOn Fonksiyonu
  const deleteAddOn = (key: string) => {
    if (currentUser?.role !== 'Admin') {
      showNotification('Only Admins can delete add-ons.', 'error');
      return;
    }

    console.log('[AppContext] deleteAddOn called with:', key);

    // 1. Önce silinecek öğeyi mevcut state içinden buluyoruz (Senkron)
    const addOnToDelete = addOns.find(
      (a) => a.uid === key || (a as any).id === key
    );

    if (!addOnToDelete) {
      console.warn('[AppContext] No add-on found locally for key:', key);
      return;
    }

    // 2. ID'yi garantiye alıyoruz
    const firestoreKey = addOnToDelete.uid || (addOnToDelete as any).id;

    if (!firestoreKey) {
        showNotification("Error: Cannot delete item without a valid ID.", "error");
        return;
    }

    // 3. State'i güncelliyoruz (Optimistic Update)
    setAddOns((prev) => prev.filter((a) => a !== addOnToDelete));
    showNotification('Deleting add-on...');

    // 4. Firestore'dan siliyoruz
    (async () => {
      try {
        await deleteAddOnFromFirestore(firestoreKey);
        console.log('[AppContext] Firestore delete completed for add-on:', firestoreKey);
        showNotification('Add-on deleted successfully.', 'success');
      } catch (error) {
        console.error('[AppContext] Failed to delete add-on in Firestore:', error);
        showNotification('Failed to delete add-on in the cloud.', 'error');
        // Hata durumunda geri yükleme (Rollback)
        setAddOns((prev) => [...prev, addOnToDelete]);
      }
    })();
  };

  // -----------------------------
  // QUOTES
  // -----------------------------
  const addQuote = (quote: Quote) => {
    const safeQuote = withDerivedDefaults(quote);

    persistAndUpdate(setQuotes, STORAGE_KEYS.QUOTES)((prev) => [
      safeQuote,
      ...prev,
    ]);
    showNotification('Quote saved successfully.');

    (async () => {
      try {
        await createOrUpdateQuoteInFirestore(safeQuote);
        console.log('[AppContext] Quote saved to Firestore:', safeQuote.id);
        logAudit("Save Quote", `Created quote for ${safeQuote.patientName}`, currentUser?.email || "Unknown", "Quote");

      } catch (error) {
        console.error('[AppContext] Failed to save quote in Firestore:', error);
        showNotification('Failed to save quote to the cloud.', 'error');
      }
    })();
  };


  const deleteQuote = (id: string) => {
    // 1. Yetki Kontrolü
    if (currentUser?.role !== 'Admin') {
      showNotification('Permission Denied: Only Admins can delete quotes.', 'error');
      console.error('[AppContext] Delete blocked. User role:', currentUser?.role);
      return;
    }

    console.log('[AppContext] 1. deleteQuote initiated for ID:', id);

    // 2. ID Validasyonu
    if (!id) {
        showNotification('Error: Cannot delete quote without an ID.', 'error');
        console.error('[AppContext] Error: ID is missing.');
        return;
    }

    // 3. Silinecek öğeyi bul ve sakla (Hata durumunda geri yüklemek için)
    let deletedItem: Quote | undefined;
    
    // 4. UI State'ini Güncelle (Optimistic Update)
    // Bu işlem ekranın anında tepki vermesini sağlar.
    setQuotes((prev) => {
        const target = prev.find((q) => q.id === id);
        if (!target) {
            console.warn(`[AppContext] Warning: Quote with ID ${id} not found in state.`);
            return prev;
        }
        
        console.log('[AppContext] 2. Removing from local state:', target);
        deletedItem = target;
        
        const newQuotes = prev.filter((q) => q.id !== id);
        saveToStorage(STORAGE_KEYS.QUOTES, newQuotes); // LocalStorage güncelle
        return newQuotes;
    });

    showNotification('Deleting quote...', 'success');

    // 5. Firestore'dan Silme (Asenkron)
    (async () => {
      try {
        console.log('[AppContext] 3. Sending delete request to Firestore...');
        
        // Firestore silme işlemini çağır
        await deleteQuoteFromFirestore(id);
        
        console.log('[AppContext] 4. Firestore delete SUCCESS for ID:', id);
        showNotification('Quote deleted successfully.', 'success');
        
        // Log kaydı (Audit)
        if (currentUser?.email) {
            logAudit("Delete Quote", `Deleted quote ${id}`, currentUser.email, "Quote");
        }

      } catch (error: any) {
        // HATA YAKALAMA ALANI
        console.error('[AppContext] 5. Firestore delete FAILED:', error);
        
        // Hata detayını kullanıcıya göster (Örn: "Missing or insufficient permissions")
        const errorMessage = error.message || 'Unknown error';
        showNotification(`Failed to delete from cloud: ${errorMessage}`, 'error');
      }
    })();
  };

  const duplicateQuote = (quote: Quote) => {
    if (currentUser?.role === 'Doctor') {
      showNotification(
        'You do not have permission to duplicate quotes.',
        'error'
      );
      return;
    }
    setQuoteToDuplicate(quote);
    setPage('calculator');
    setTimeout(() => setQuoteToDuplicate(null), 100);
  };

  // -----------------------------
  // USERS / ROLES
  // -----------------------------
  const updateUserRole = (email: string, role: UserRole) => {
    if (currentUser?.role !== 'Admin') {
      showNotification('Only Admins can change user roles.', 'error');
      return;
    }
    
    persistAndUpdate(setUsers, STORAGE_KEYS.USERS)((prev) =>
      prev.map((u) => (u.email === email ? { ...u, role } : u))
    );
    showNotification(`User role for ${email} updated.`);

    const targetUser = users.find(u => u.email === email);
    if (targetUser && targetUser.uid) {
        updateUserRoleInFirestore(targetUser.uid, role)
            .then(() => {
                console.log(`Role updated in Firestore for ${email}`);
                logAudit("Role Change", `Changed ${email} role to ${role}`, currentUser.email, "User");
            })
            .catch((err) => {
                console.error("Failed to update role in Firestore:", err);
                showNotification("Could not save role change to the cloud.", "error");
            });
    }
  };

  // -----------------------------
  // DOCTOR COMMENTS
  // -----------------------------
  const addDoctorComment = (quoteId: string, commentText: string) => {
    if (currentUser?.role !== 'Doctor') {
      showNotification('Only Doctors can add comments.', 'error');
      return;
    }
    if (!commentText.trim()) {
      showNotification('Comment cannot be empty.', 'error');
      return;
    }
    const newComment: QuoteDoctorComment = {
      authorName: currentUser.name,
      authorEmail: currentUser.email,
      createdAt: new Date().toISOString(),
      text: commentText.trim(),
    };
    persistAndUpdate(setQuotes, STORAGE_KEYS.QUOTES)((prev) =>
      prev.map((q) =>
        q.id === quoteId
          ? { ...q, doctorComments: [...(q.doctorComments || []), newComment] }
          : q
      )
    );
    showNotification('Comment added successfully.');
  };

  // ✅ DÜZELTİLDİ: Hastane Yönetimi (deleteHospital)
  const addHospital = async (name: string) => {
      if (currentUser?.role !== 'Admin') return;
      try {
          const newHospital = await addHospitalToFirestore(name);
          setHospitals(prev => [...prev, newHospital]);
          showNotification('Hospital added.', 'success');
      } catch (error) {
          showNotification('Failed to add hospital.', 'error');
      }
  };

  const deleteHospital = async (id: string) => {
      if (currentUser?.role !== 'Admin') {
          showNotification('Only Admins can delete hospitals.', 'error');
          return;
      }
      
      if (!id) {
          console.error("Delete Hospital Error: Missing ID");
          return;
      }

      // Optimistic UI Update: Önce state'i güncelle, sonra Firestore'u ara
      const previousHospitals = [...hospitals];
      setHospitals(prev => prev.filter(h => h.id !== id));
      
      try {
          await deleteHospitalFromFirestore(id);
          console.log('Hospital deleted from Firestore:', id);
          showNotification('Hospital deleted.', 'success');
      } catch (error) {
          console.error('Failed to delete hospital:', error);
          showNotification('Failed to delete hospital.', 'error');
          // Hata durumunda geri yükle
          setHospitals(previousHospitals);
      }
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        users,
        treatments,
        addOns,
        quotes,
        doctors,
        hospitals,
        page,
        quoteToDuplicate,
        notification,
        login,
        logout,
        setPage,
        addTreatment,
        updateTreatment,
        deleteTreatment,
        deleteMultipleTreatments,
        addAddOn,
        updateAddOn,
        deleteAddOn,
        addQuote,
        deleteQuote,
        duplicateQuote,
        updateUserRole,
        addDoctorComment,
        showNotification,
        updateDoctorPriceMultiplier,
        addHospital,
        deleteHospital,
        setDoctors: setDoctorsWithSync, // ✅ YENİ: Doctors state'ini sync özelliği ile açıyoruz
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = (): AppContextType => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};