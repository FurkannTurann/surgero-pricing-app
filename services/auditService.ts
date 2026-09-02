// src/services/auditService.ts
import { db } from './firebase';
import { collection, addDoc, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { AuditLog } from '../types/entities';

const COLLECTION_NAME = 'audit_logs';

/**
 * Yeni bir işlem kaydı (Log) oluşturur.
 */
export const logAudit = async (
  action: string,
  details: string,
  performedBy: string,
  category: AuditLog['category'] = 'System'
) => {
  try {
    await addDoc(collection(db, COLLECTION_NAME), {
      action,
      details,
      performedBy,
      category,
      timestamp: new Date().toISOString(),
    });
    // Log işlemi sessizce yapılır, kullanıcıyı rahatsız etmez.
  } catch (error) {
    console.error("Audit loglama hatası:", error);
  }
};

/**
 * Son logları getirir (Admin Panel için).
 * @param limitCount Kaç log getirileceği (Varsayılan 50)
 */
export const fetchAuditLogs = async (limitCount = 50): Promise<AuditLog[]> => {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );
    
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as AuditLog));
  } catch (error) {
    console.error("Loglar çekilemedi:", error);
    return [];
  }
};