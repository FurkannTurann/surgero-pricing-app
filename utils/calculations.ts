// src/utils/calculations.ts

import {
  Treatment,
  AddOn,
  Doctor,
  QuoteTreatment,
  QuoteAddOn,
  QuoteDerivedValues,
} from '../types/entities';

type SelectedTreatment = {
  treatment: Treatment;
  doctor: Doctor;
  // Price Calculator'da satır bazlı girdiğimiz alanlar:
  discountPercent?: number;   // kombine indirim %
  isCombined?: boolean;       // sadece UI için flag
};

type SelectedAddOn = {
  addOn: AddOn;
  quantity: number;
};

interface CalcInput {
  treatments: SelectedTreatment[];
  addOns: SelectedAddOn[];
  vatPercent: number;
  depositPercent: number;
  hotelNights: number;
}

interface CalcResult {
  derived: QuoteDerivedValues & {
    multiTreatmentDiscountUsd: number;
  };
  quoteTreatments: QuoteTreatment[];
  quoteAddOns: QuoteAddOn[];
}

// Güvenli sayı helper
const toSafeNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  if (typeof value === 'string') {
    const n = Number(value.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(n)) return n;
  }

  return fallback;
};

export function calculateDerivedValues({
  treatments,
  addOns,
  vatPercent,
  depositPercent,
  hotelNights,
}: CalcInput): CalcResult {
  const quoteTreatments: QuoteTreatment[] = [];
  const quoteAddOns: QuoteAddOn[] = [];

  // Toplamlar
  let totalTreatmentsUsd = 0;          // indirim sonrası FINAL toplam
  let totalAddOnsUsd = 0;

  // ⬇️ Artık toplam değil, maksimum hospital stay tutacağız
  let totalHospitalNights = 0;

  let totalBaseContractUsd = 0;        // doktor kontrat (base) toplamı
  let totalSaleBaseUsd = 0;            // multiplier sonrası, indirim öncesi SALE BASE toplamı

  // -----------------------------
  // TREATMENTS
  // -----------------------------
  for (const item of treatments) {
    const t = item.treatment;
    const d = item.doctor;

    // Manage Data'daki "Base Price (USD)" = doktorla anlaşılan çıplak rakam
    const basePriceUsd = toSafeNumber(
      (t as any).basePriceUsd ?? (t as any).basePrice ?? 0,
      0
    );

    const minStay = toSafeNumber((t as any).minStay ?? 0, 0);
    const hospitalStay = toSafeNumber((t as any).hospitalStay ?? 0, 0);

    // 🔹 Doktor SALE multiplier (Firestore alanı: doctor.priceMultiplier)
    // Yoksa 1.0 (yani %0 markup).
    const priceMultiplier = toSafeNumber(
      (d as any).priceMultiplier ?? 1,
      1
    );

    // SALE BASE: hastaya gidecek fiyat, indirimden önce, sadece markup uygulanmış hali
    const saleBasePriceUsd = basePriceUsd * priceMultiplier;

    // Kombine indirim %
    let discountPercent = toSafeNumber(item.discountPercent ?? 0, 0);
    discountPercent = Math.max(0, Math.min(100, discountPercent)); // 0–100 arası clamp

    const appliedDiscountPercent = discountPercent;
    const isCombined = !!item.isCombined || discountPercent > 0;

    // 🔑 KURAL:
    // Final price = SALE BASE * (1 - discount%)
    const finalPriceUsd =
      saleBasePriceUsd * (1 - appliedDiscountPercent / 100);

    // Toplamlar:
    totalTreatmentsUsd += finalPriceUsd;
    totalBaseContractUsd += basePriceUsd;
    totalSaleBaseUsd += saleBasePriceUsd;

    // ⬇️ Burada sadece en yüksek hospitalStay değerini tutuyoruz
    if (hospitalStay > totalHospitalNights) {
      totalHospitalNights = hospitalStay;
    }

    quoteTreatments.push({
      treatmentUid: t.uid,
      doctorUid: d.uid,
      name: t.name,
      department: t.department,

      // Fiyat alanları:
      basePriceUsd,        // Doktor kontrat fiyatı (internal base)
      saleBasePriceUsd,    // Markup sonrası, indirim öncesi
      doctorMultiplier: priceMultiplier,
      appliedDiscountPercent,
      finalPriceUsd,

      minStayNights: minStay,
      hospitalStayNights: hospitalStay,

      // History / PDF için ekstra label'lar:
      treatmentName: t.name,
      doctorName: d.name,
      isCombined,
    } as QuoteTreatment);
  }

  // -----------------------------
  // ADD-ONS
  // -----------------------------
  for (const item of addOns) {
    const a = item.addOn;

    const basePriceUsd = toSafeNumber(
      (a as any).basePriceUsd ?? (a as any).basePrice ?? 0,
      0
    );

    const quantity = toSafeNumber(item.quantity, 0);
    const lineTotalUsd = basePriceUsd * quantity;

    totalAddOnsUsd += lineTotalUsd;

    quoteAddOns.push({
      addOnUid: a.uid,
      name: a.name,
      priceType: a.priceType,
      unitPriceUsd: basePriceUsd,
      quantity,
      lineTotalUsd,
      category: (a as any).category,
    } as QuoteAddOn);
  }

  // -----------------------------
  // DERIVED SUMMARY
  // -----------------------------
  const subtotalUsd = totalTreatmentsUsd + totalAddOnsUsd;
  const safeVatPercent = toSafeNumber(vatPercent, 0);
  const safeDepositPercent = toSafeNumber(depositPercent, 0);

  const vatUsd = subtotalUsd * (safeVatPercent / 100);
  const grandTotalUsd = subtotalUsd + vatUsd;
  const depositUsd = grandTotalUsd * (safeDepositPercent / 100);
  const balanceUsd = grandTotalUsd - depositUsd;

  // Multi-treatment indirim tutarı:
  // (indirim olmasa ödeyeceği SALE BASE toplamı) - (indirimli FINAL toplam)
  const safeSaleBaseTotal = toSafeNumber(totalSaleBaseUsd, 0);
  const safeFinalTotal = toSafeNumber(totalTreatmentsUsd, 0);
  const multiTreatmentDiscountUsd = Math.max(
    0,
    safeSaleBaseTotal - safeFinalTotal
  );

  const totalHotelNights = toSafeNumber(hotelNights, 0);

  const derived: QuoteDerivedValues & { multiTreatmentDiscountUsd: number } = {
    totalBaseUsd: totalBaseContractUsd,          // kontrat base toplamı
    totalAfterDoctorAdjUsd: totalSaleBaseUsd,    // multiplier sonrası, indirim öncesi
    totalAfterDiscountUsd: totalTreatmentsUsd,   // indirim sonrası treatment toplamı
    totalAddOnsUsd,
    subtotalUsd,
    vatUsd,
    grandTotalUsd,
    depositUsd,
    balanceUsd,
    totalHotelNights,        // otel geceleri (kullanıcının girdiği)
    totalHospitalNights,     // ⬅️ seçilen tedavilerdeki MAX hospital stay
    multiTreatmentDiscountUsd,
  };

  return {
    derived,
    quoteTreatments,
    quoteAddOns,
  };
}
