export type UserRole = "Admin" | "Team" | "Doctor";
export const USER_ROLES: UserRole[] = ["Admin", "Team", "Doctor"];

export interface User {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  password?: string;
  doctorCode?: string;
  // 👇 YENİ EKLENENLER (Yönetim Paneli İçin)
  isActive?: boolean;       // true: Giriş yapabilir, false: Engelli
  lastLoginAt?: string;     // Son giriş tarihi (ISO formatında)
}

export type Page = 'calculator' | 'treatments' | 'addons' | 'history' | 'admin';

export type Department =
  | "Plastic Surgery"
  | "Dental"
  | "Hair"
  | "Non-invasive";
export const DEPARTMENTS: Department[] = ["Plastic Surgery", "Dental", "Hair", "Non-invasive"];

export interface Doctor {
  uid: string;
  name: string;
  imageUrl?: string; 
  code: string;
  email: string; // 'emaik' typo düzeltildi
  priceMultiplier: number;
  departments: Department[];
  isActive: boolean;
  saleMarkupPercent?: number;
}

export interface Treatment {
  id: string; // Firestore document ID
  uid: string;
  name: string;
  basePriceUsd: number;
  department: Department;
  minStay: number;
  hospitalStay: number;
  combinedDiscount?: number;
  defaultDoctorCode?: string;
}

export type AddOnCategory =
  | "accommodation"
  | "transportation"
  | "extra_services";
  
export const ADDON_CATEGORIES: { value: AddOnCategory, label: string }[] = [
    { value: "accommodation", label: "Accommodation" },
    { value: "transportation", label: "Transportation" },
    { value: "extra_services", label: "Extra Services" }
];

export type AddOnPriceType =
  | "per_night"
  | "per_product";
export const ADDON_PRICE_TYPES: AddOnPriceType[] = ["per_night", "per_product"];

export interface AddOn {
  uid: string;
  name: string;
  basePrice: number; // Burada basePrice var ama kodda basePriceUsd kullanıyor olabilirsin, dikkat et.
  basePriceUsd?: number; // Kodda bunu kullanıyorsan interface'de olmalı.
  category: AddOnCategory;
  priceType: AddOnPriceType;
}

export type Currency = "USD" | "EUR" | "GBP";
export const CURRENCIES: Currency[] = ["USD", "EUR", "GBP"];

export interface QuoteTreatment {
  treatmentUid: string;
  name: string;
  department: Department;
  basePriceUsd: number;
  doctorUid: string;
  doctorName: string;
  doctorCode: string;
  doctorMultiplier: number;
  doctorAdjustedBaseUsd: number;
  appliedDiscountPercent: number;
  finalPriceUsd: number;
  minStay: number;
  hospitalStay: number;
}

export interface QuoteAddOn {
  addOnUid: string;
  name: string;
  category: AddOnCategory;
  priceType: AddOnPriceType;
  unitPriceUsd: number;
  quantity: number;
  lineTotalUsd: number;
}

export interface QuoteDerivedValues {
  totalBaseUsd: number;
  totalAfterDoctorAdjUsd: number;
  totalAfterDiscountUsd: number;
  totalAddOnsUsd: number;
  subtotalUsd: number;
  vatUsd: number;
  grandTotalUsd: number;
  depositUsd: number;
  balanceUsd: number;
  totalHotelNights: number;
  totalHospitalNights: number;
  multiTreatmentDiscountUsd?: number; 
}

export interface QuoteDoctorComment {
  authorName: string;
  authorEmail: string;
  createdAt: string;
  text: string;
}

export interface Quote {
  id: string;
  createdAt: string;
  createdBy: { name: string; email: string };
  patientName: string;
  currency: Currency;
  vatPercent: number;
  depositPercent: number;
  treatments: QuoteTreatment[];
  addOns: QuoteAddOn[];
  doctorComments?: QuoteDoctorComment[];
  derived: QuoteDerivedValues;
  hotelNights: number;
}

export interface AuditLog {
  id: string;
  action: string;       // Örn: "User Created", "Price Updated"
  details: string;      // Örn: "Admin created user test@test.com"
  performedBy: string;  // İşlemi yapan Admin email
  timestamp: string;    // ISO Date String
  category: 'User' | 'Treatment' | 'Quote' | 'System';
}

export interface Hospital {
  id: string;
  name: string;
}