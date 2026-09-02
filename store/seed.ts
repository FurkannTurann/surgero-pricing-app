import { Treatment, AddOn, Doctor, AddOnCategory, AddOnPriceType } from '../types/entities';
import { generateUUID } from '../utils/helpers';

export const seedDoctors: Doctor[] = [
  {
    uid: generateUUID(),
    name: 'Demo Surgeon A',
    code: 'SURGEON_A',
    email: 'surgeon.a@example.com',
    priceMultiplier: 1.2,
    departments: ['Plastic Surgery', 'Hair'],
    isActive: true,
  },
  {
    uid: generateUUID(),
    name: 'Demo Surgeon B',
    code: 'SURGEON_B',
    email: 'surgeon.b@example.com',
    priceMultiplier: 1.0,
    // FIX: Corrected casing of 'Non-invasive' to match Department type.
    departments: ['Plastic Surgery', 'Non-invasive'],
    isActive: true,
  },
  {
    uid: generateUUID(),
    name: 'Demo Surgeon C',
    code: 'SURGEON_C',
    email: 'surgeon.c@example.com',
    priceMultiplier: 1.0,
    departments: ['Dental'],
    isActive: true,
  },
  {
    uid: generateUUID(),
    name: 'Demo Surgeon D',
    code: 'SURGEON_D',
    email: 'surgeon.d@example.com',
    priceMultiplier: 1.1,
    // FIX: Corrected casing of 'Non-invasive' to match Department type.
    departments: ['Hair', 'Non-invasive'],
    isActive: false,
  }
];

// FIX: Add 'id' property to each treatment to match the Treatment type.
const t1_uid = generateUUID();
const t2_uid = generateUUID();
const t3_uid = generateUUID();
const t4_uid = generateUUID();
const t5_uid = generateUUID();
const t6_uid = generateUUID();

export const seedTreatments: Treatment[] = [
  {
    id: t1_uid,
    uid: t1_uid,
    name: 'Rhinoplasty (Standard)',
    department: 'Plastic Surgery',
    basePriceUsd: 2400,
    minStay: 7,
    hospitalStay: 1,
    combinedDiscount: 15,
    defaultDoctorCode: 'SURGEON_A',
  },
  {
    id: t2_uid,
    uid: t2_uid,
    name: 'Breast Augmentation (Implants)',
    department: 'Plastic Surgery',
    basePriceUsd: 2800,
    minStay: 8,
    hospitalStay: 1,
    combinedDiscount: 10,
    defaultDoctorCode: 'SURGEON_B',
  },
  {
    id: t3_uid,
    uid: t3_uid,
    name: 'Dental Implants (per tooth)',
    department: 'Dental',
    basePriceUsd: 900,
    minStay: 5,
    hospitalStay: 0,
    combinedDiscount: 0,
    defaultDoctorCode: 'SURGEON_C',
  },
  {
    id: t4_uid,
    uid: t4_uid,
    name: 'FUE Hair Transplant (2000 grafts)',
    department: 'Hair',
    basePriceUsd: 1800,
    minStay: 4,
    hospitalStay: 0,
    combinedDiscount: 5,
    defaultDoctorCode: 'SURGEON_A',
  },
  {
    id: t5_uid,
    uid: t5_uid,
    name: 'Botox (per area)',
    // FIX: Corrected casing of 'Non-invasive' to match Department type.
    department: 'Non-invasive',
    basePriceUsd: 250,
    minStay: 1,
    hospitalStay: 0,
    combinedDiscount: 20,
    defaultDoctorCode: 'SURGEON_B',
  },
    {
    id: t6_uid,
    uid: t6_uid,
    name: 'Liposuction (Large Area)',
    department: 'Plastic Surgery',
    basePriceUsd: 2200,
    minStay: 6,
    hospitalStay: 1,
    combinedDiscount: 15,
    defaultDoctorCode: 'SURGEON_B',
  },
];

export const seedAddOns: AddOn[] = [
  {
    uid: generateUUID(),
    name: 'Standard Hotel (4★)',
    basePrice: 100,
    category: 'accommodation',
    priceType: 'per_night',
  },
  {
    uid: generateUUID(),
    name: 'Luxury Hotel (5★)',
    basePrice: 180,
    category: 'accommodation',
    priceType: 'per_night',
  },
  {
    uid: generateUUID(),
    name: 'VIP Airport Transfer (Round Trip)',
    basePrice: 120,
    category: 'transportation',
    priceType: 'per_product',
  },
  {
    uid: generateUUID(),
    name: 'Private Nurse (per day)',
    basePrice: 150,
    category: 'extra_services',
    priceType: 'per_night',
  },
  {
    uid: generateUUID(),
    name: 'City Tour Package',
    basePrice: 200,
    category: 'extra_services',
    priceType: 'per_product',
  },
];
