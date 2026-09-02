import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import Card from '../components/Card';
import { Input, NumberInput, Select } from '../components/Input';
import {
  Treatment,
  AddOn,
  Currency,
  QuoteTreatment,
  QuoteAddOn,
  CURRENCIES,
  Quote,
  Doctor,
} from '../types/entities';
import { calculateDerivedValues } from '../utils/calculations';
import { formatCurrency, generateUUID } from '../utils/helpers';
import Alert from '../components/Alert';
import { generateMultiPagePdf, QuotePdfData } from '../utils/pdfGenerator';

const toSafeNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  if (typeof value === 'string') {
    const n = Number(value.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(n)) return n;
  }

  return fallback;
};

// Helper: Bir hizmetin gecelik (otel) olup olmadığını anla
const isNightlyService = (addOn: AddOn) => {
  const pType = (addOn.priceType || '').toLowerCase();
  const cat = (addOn.category || '').toLowerCase();
  const name = (addOn.name || '').toLowerCase();
  
  return pType.includes('night') || cat.includes('accommodation') || name.includes('hotel');
};

// Tarih formatlama helper
const formatOfferDate = (date: Date): string => {
  const day = date.getDate();
  const suffix =
    day === 1 || day === 21 || day === 31
      ? 'st'
      : day === 2 || day === 22
      ? 'nd'
      : day === 3 || day === 23
      ? 'rd'
      : 'th';

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  return `${day}${suffix} of ${months[date.getMonth()]}, ${date.getFullYear()}`;
};

// İstenilen gün kadar sonrasını hesaplayan fonksiyon
const getFutureDateFormatted = (daysToAdd: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + daysToAdd);
  return formatOfferDate(d);
};

type SelectedTreatment = {
  treatment: Treatment;
  doctor: Doctor;
  discountPercent?: number;
  isCombined?: boolean;
};

type PdfMetaState = {
  hospitalName: string;
  offerValidUntil: string;
  depositDueUntil: string;
};

const PriceCalculatorPage: React.FC = () => {
  const {
    treatments: treatmentCatalog,
    addOns: addOnCatalog,
    doctors,
    hospitals,
    addQuote,
    currentUser,
    quoteToDuplicate,
    showNotification,
  } = useAppContext();

  const isDoctorUser = currentUser?.role === 'Doctor';

  // -----------------------------
  // ROL BAZLI GÖRÜNÜRLÜK
  // -----------------------------
  const treatmentsVisibleByRole = useMemo(() => {
    if (currentUser?.role !== 'Doctor') return treatmentCatalog;

    const doctorCode =
      currentUser.doctorCode ||
      doctors.find((d) => d.email.toLowerCase() === currentUser.email.toLowerCase())?.code ||
      doctors.find((d) => d.name.toLowerCase() === currentUser.name.toLowerCase())?.code;

    if (!doctorCode) return [];
    return treatmentCatalog.filter((t) => t.defaultDoctorCode === doctorCode);
  }, [currentUser, treatmentCatalog, doctors]);

  // -----------------------------
  // FORM STATE
  // -----------------------------
  const [patientName, setPatientName] = useState('');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [vatPercent, setVatPercent] = useState(0);
  const [depositPercent, setDepositPercent] = useState(20);
  const [selectedTreatments, setSelectedTreatments] = useState<SelectedTreatment[]>([]);
  const [selectedAddOns, setSelectedAddOns] = useState<{ addOn: AddOn; quantity: number }[]>([]);
  const [hotelNights, setHotelNights] = useState(0);

  // UI STATE
  const [doctorFilter, setDoctorFilter] = useState<string | 'All'>(() => {
    if (currentUser?.role === 'Doctor' && currentUser.doctorCode) {
      return currentUser.doctorCode;
    }
    return 'All';
  });

  const [treatmentSearchTerm, setTreatmentSearchTerm] = useState('');
  const [isTreatmentDropdownOpen, setIsTreatmentDropdownOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [doctorSearchTerms, setDoctorSearchTerms] = useState<Record<string, string>>({});
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // PDF modal state
  const [isPdfMetaOpen, setIsPdfMetaOpen] = useState(false);
  const [pdfMeta, setPdfMeta] = useState<PdfMetaState>({
    hospitalName: '', 
    offerValidUntil: '',
    depositDueUntil: '',
  });

  // -----------------------------
  // RESET FORM
  // -----------------------------
  const handleResetForm = () => {
    if (window.confirm('Are you sure you want to clear ALL fields? This cannot be undone.')) {
      setPatientName('');
      setCurrency('USD');
      setVatPercent(0);
      setDepositPercent(20);
      setSelectedTreatments([]);
      setSelectedAddOns([]);
      setHotelNights(0);
      setErrors({});
      setTreatmentSearchTerm('');
      setPdfMeta({ 
          hospitalName: '', 
          offerValidUntil: '', 
          depositDueUntil: '' 
      });
      showNotification('Form completely reset.', 'success');
    }
  };

  // -----------------------------
  // DUPLICATE LOGIC
  // -----------------------------
  useEffect(() => {
    if (!quoteToDuplicate) return;

    setPatientName(`${quoteToDuplicate.patientName} (Copy)`);
    setCurrency(quoteToDuplicate.currency);
    setVatPercent(quoteToDuplicate.vatPercent);
    setDepositPercent(quoteToDuplicate.depositPercent);

    const duplicatedTreatments = quoteToDuplicate.treatments
      .map((qt) => {
        const treatment = treatmentsVisibleByRole.find((t) => t.uid === qt.treatmentUid);
        const doctor = doctors.find((d) => d.uid === qt.doctorUid);
        if (!treatment || !doctor) return null;

        const discountPercent = toSafeNumber((qt as any).appliedDiscountPercent ?? 0, 0);
        const isCombined = (qt as any).isCombined ?? discountPercent > 0;

        return { treatment, doctor, discountPercent, isCombined } as SelectedTreatment;
      })
      .filter((item): item is SelectedTreatment => item !== null);

    setSelectedTreatments(duplicatedTreatments);

    const duplicatedAddOns = quoteToDuplicate.addOns
      .map((qa) => {
        const addOn = addOnCatalog.find((a) => a.uid === qa.addOnUid);
        return addOn ? { addOn, quantity: qa.quantity } : null;
      })
      .filter((item): item is { addOn: AddOn; quantity: number } => item !== null);
    setSelectedAddOns(duplicatedAddOns);

    setHotelNights(quoteToDuplicate.hotelNights);
  }, [quoteToDuplicate, treatmentsVisibleByRole, addOnCatalog, doctors]);

  // -----------------------------
  // CALCULATIONS (Derived)
  // -----------------------------
  const rawCalculationResult = useMemo(() => {
    return calculateDerivedValues({
      treatments: selectedTreatments,
      addOns: selectedAddOns,
      vatPercent,
      depositPercent,
      hotelNights,
    });
  }, [selectedTreatments, selectedAddOns, vatPercent, depositPercent, hotelNights]);

  const { derived, quoteTreatments, quoteAddOns } = useMemo(() => {
    const rawDerived = rawCalculationResult?.derived ?? {
      totalAfterDiscountUsd: 0, totalAddOnsUsd: 0, subtotalUsd: 0, vatUsd: 0,
      grandTotalUsd: 0, depositUsd: 0, balanceUsd: 0, totalHospitalNights: 0, multiTreatmentDiscountUsd: 0,
    };

    const safeDerived = {
      ...rawDerived,
      totalAfterDiscountUsd: toSafeNumber(rawDerived.totalAfterDiscountUsd),
      totalAddOnsUsd: toSafeNumber(rawDerived.totalAddOnsUsd),
      subtotalUsd: toSafeNumber(rawDerived.subtotalUsd),
      vatUsd: toSafeNumber(rawDerived.vatUsd),
      grandTotalUsd: toSafeNumber(rawDerived.grandTotalUsd),
      depositUsd: toSafeNumber(rawDerived.depositUsd),
      balanceUsd: toSafeNumber(rawDerived.balanceUsd),
      totalHospitalNights: toSafeNumber(rawDerived.totalHospitalNights),
      multiTreatmentDiscountUsd: toSafeNumber((rawDerived as any).multiTreatmentDiscountUsd ?? 0, 0),
    };

    const safeQuoteTreatments: QuoteTreatment[] = (rawCalculationResult?.quoteTreatments ?? []).map(t => ({
      ...t,
      basePriceUsd: toSafeNumber(t.basePriceUsd),
      doctorMultiplier: toSafeNumber((t as any).doctorMultiplier ?? 1, 1),
      appliedDiscountPercent: toSafeNumber((t as any).appliedDiscountPercent ?? 0, 0),
      finalPriceUsd: toSafeNumber(t.finalPriceUsd, t.basePriceUsd),
    }));

    const safeQuoteAddOns: QuoteAddOn[] = (rawCalculationResult?.quoteAddOns ?? []).map(a => ({
      ...a,
      unitPriceUsd: toSafeNumber(a.unitPriceUsd),
      quantity: toSafeNumber((a as any).quantity ?? 0, 0),
      lineTotalUsd: toSafeNumber(a.lineTotalUsd, 0),
    }));

    return { derived: safeDerived, quoteTreatments: safeQuoteTreatments, quoteAddOns: safeQuoteAddOns };
  }, [rawCalculationResult]);

  const multiTreatmentDiscountValue = toSafeNumber((derived as any).multiTreatmentDiscountUsd ?? 0, 0);

  // ✅ YENİ: Toplam Base Price Hesaplama (İndirimli)
  const totalBaseCost = useMemo(() => {
    if (isDoctorUser) return 0; // Doktorlar görmemeli

    // Tedavilerin Base Price Toplamı (İndirimler Dahil)
    const treatmentsBase = quoteTreatments.reduce((sum, t) => {
      // İndirim oranını al (varsa)
      const discount = (t as any).appliedDiscountPercent || 0;
      // İndirimli base fiyatı hesapla
      const discountedBase = t.basePriceUsd * (1 - discount / 100);
      
      return sum + discountedBase;
    }, 0);
    
    // Add-on'lar (Standart hesap)
    const addOnsBase = quoteAddOns.reduce((sum, a) => sum + (a.unitPriceUsd * a.quantity), 0);

    return treatmentsBase + addOnsBase;
  }, [quoteTreatments, quoteAddOns, isDoctorUser]);

  // -----------------------------
  // DOCTOR SUMMARY
  // -----------------------------
  const doctorSummary = useMemo(() => {
    if (!isDoctorUser) return null;
    const treatmentsSubtotal = quoteTreatments.reduce((sum, t) => {
      const base = toSafeNumber(t.basePriceUsd, 0);
      const discount = toSafeNumber((t as any).appliedDiscountPercent ?? 0, 0);
      return sum + (base * (1 - discount / 100));
    }, 0);

    const addOnsSubtotal = quoteAddOns.reduce((sum, a) => {
      const unit = toSafeNumber(a.unitPriceUsd, 0);
      const qty = toSafeNumber((a as any).quantity ?? 0, 0);
      return sum + (unit * qty);
    }, 0);

    const subtotal = treatmentsSubtotal + addOnsSubtotal;
    const vatRate = toSafeNumber(vatPercent, 0) / 100;
    const depositRate = toSafeNumber(depositPercent, 0) / 100;
    const vat = subtotal * vatRate;
    const grandTotal = subtotal + vat;
    const deposit = grandTotal * depositRate;
    const balance = grandTotal - deposit;

    return { treatmentsSubtotal, addOnsSubtotal, subtotal, vat, grandTotal, deposit, balance };
  }, [isDoctorUser, quoteTreatments, quoteAddOns, vatPercent, depositPercent]);

  // -----------------------------
  // MIN STAY & CATALOG FILTER
  // -----------------------------
  const minHotelStay = useMemo(() => Math.max(0, ...selectedTreatments.map((t) => t.treatment.minStay)), [selectedTreatments]);

  const filteredTreatmentCatalog = useMemo(() => {
    const filtered = treatmentsVisibleByRole.filter((t) => {
      const matchesDoctor = doctorFilter === 'All' || t.defaultDoctorCode === doctorFilter;
      const matchesSearch = t.name.toLowerCase().includes(treatmentSearchTerm.toLowerCase());
      return matchesDoctor && matchesSearch;
    });
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [treatmentsVisibleByRole, doctorFilter, treatmentSearchTerm]);

  useEffect(() => {
    if (selectedTreatments.length > 0 && hotelNights < minHotelStay) {
      setHotelNights(minHotelStay);
    } else if (selectedTreatments.length === 0) {
      setHotelNights(0);
    }
  }, [minHotelStay, selectedTreatments.length, hotelNights]);

  // Otomatik Güncelleme (Min Stay - 1)
  useEffect(() => {
    setSelectedAddOns((prev) => prev.map((item) =>
      isNightlyService(item.addOn)
        ? { ...item, quantity: Math.max(0, hotelNights - 1) } 
        : item
    ));
  }, [hotelNights]);

  const treatmentDiscountMap = useMemo(() => {
    const m: Record<string, { isCombined: boolean; discountPercent: number }> = {};
    selectedTreatments.forEach((st) => {
      m[st.treatment.uid] = {
        isCombined: st.isCombined ?? (st.discountPercent ?? 0) > 0,
        discountPercent: st.discountPercent ?? 0,
      };
    });
    return m;
  }, [selectedTreatments]);

  // -----------------------------
  // HANDLERS
  // -----------------------------
  const handleAddTreatment = (uid: string) => {
    const treatmentToAdd = treatmentsVisibleByRole.find((t) => t.uid === uid);
    if (!treatmentToAdd || selectedTreatments.some((t) => t.treatment.uid === uid)) return;

    const defaultDoctor =
      doctors.find((d) => d.code === treatmentToAdd.defaultDoctorCode) ||
      doctors.find((d) => d.departments.includes(treatmentToAdd.department));

    if (!defaultDoctor) return;

    setSelectedTreatments((prev) => [
      ...prev,
      { treatment: treatmentToAdd, doctor: defaultDoctor, discountPercent: 0, isCombined: false },
    ]);
  };

  const handleRemoveTreatment = (uid: string) => {
    setSelectedTreatments((prev) => prev.filter((t) => t.treatment.uid !== uid));
    setDoctorSearchTerms((prev) => {
      const next = { ...prev };
      delete next[uid];
      return next;
    });
  };

  const handleDoctorChange = (treatmentUid: string, doctorUid: string) => {
    if (isDoctorUser) return;
    const newDoctor = doctors.find((d) => d.uid === doctorUid);
    if (!newDoctor) return;
    setSelectedTreatments((prev) =>
      prev.map((t) => t.treatment.uid === treatmentUid ? { ...t, doctor: newDoctor } : t)
    );
  };

  const handleDoctorSearchChange = (treatmentUid: string, term: string) => {
    setDoctorSearchTerms((prev) => ({ ...prev, [treatmentUid]: term }));
  };

  const handleToggleCombined = (treatmentUid: string) => {
    setSelectedTreatments((prev) =>
      prev.map((st) => {
        if (st.treatment.uid !== treatmentUid) return st;
        const currentCombined = st.isCombined ?? (toSafeNumber(st.discountPercent ?? 0, 0) > 0);
        return {
          ...st,
          isCombined: !currentCombined,
          discountPercent: !currentCombined ? st.discountPercent ?? 0 : 0,
        };
      })
    );
  };

  const handleDiscountPercentChange = (treatmentUid: string, value: number) => {
    const safeValue = Math.max(0, Math.min(100, value || 0));
    setSelectedTreatments((prev) =>
      prev.map((st) => st.treatment.uid === treatmentUid ? {
        ...st,
        discountPercent: safeValue,
        isCombined: (st.isCombined ?? safeValue > 0) ? true : safeValue > 0,
      } : st)
    );
  };

  const handleAddAddOn = (uid: string) => {
    const addOnToAdd = addOnCatalog.find((a) => a.uid === uid);
    if (!addOnToAdd || selectedAddOns.some((a) => a.addOn.uid === uid)) return;
    
    const quantity = isNightlyService(addOnToAdd)
        ? Math.max(0, hotelNights - 1) 
        : 1;
        
    setSelectedAddOns((prev) => [...prev, { addOn: addOnToAdd, quantity }]);
  };

  const handleRemoveAddOn = (uid: string) => {
    setSelectedAddOns((prev) => prev.filter((a) => a.addOn.uid !== uid));
  };

  const handleAddonQuantityChange = (uid: string, quantity: number) => {
    setSelectedAddOns((prev) =>
      prev.map((a) => a.addOn.uid === uid ? { ...a, quantity: Math.max(0, quantity) } : a)
    );
  };

  // -----------------------------
  // VALIDATION & SAVING
  // -----------------------------
  const validateQuote = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!patientName.trim()) newErrors.patientName = 'Patient name is required.';
    if (selectedTreatments.length === 0) newErrors.treatments = 'At least one treatment must be selected.';
    if (vatPercent < 0) newErrors.vat = 'VAT cannot be negative.';
    if (depositPercent < 0 || depositPercent > 100) newErrors.deposit = 'Invalid deposit percentage.';
    if (hotelNights < minHotelStay) newErrors.hotelNights = `Minimum ${minHotelStay} nights required.`;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const buildQuoteForSaveAndPdf = (): Quote | null => {
    if (!validateQuote() || !currentUser) return null;
    return {
      id: generateUUID(),
      createdAt: new Date().toISOString(),
      createdBy: { name: currentUser.name, email: currentUser.email },
      patientName: patientName.trim(),
      currency,
      vatPercent,
      depositPercent,
      treatments: quoteTreatments,
      addOns: quoteAddOns,
      derived,
      hotelNights,
    };
  };

  const handleSaveQuote = () => {
    const newQuote = buildQuoteForSaveAndPdf();
    if (newQuote) addQuote(newQuote);
  };

  const handleOpenPdfMeta = () => {
    if (!isSavable) return;

    // Eğer hiç hastane yoksa boş bırak, varsa ilkini seç
    const defaultHospital = hospitals.length > 0 ? hospitals[0].name : '';

    setPdfMeta((prev) => ({
      ...prev,
      hospitalName: prev.hospitalName || defaultHospital,
      offerValidUntil: prev.offerValidUntil.trim() ? prev.offerValidUntil : getFutureDateFormatted(15),
      depositDueUntil: prev.depositDueUntil.trim() ? prev.depositDueUntil : getFutureDateFormatted(30),
    }));
    
    setIsPdfMetaOpen(true);
  };

  const handleGeneratePdf = async () => {
    const newQuote = buildQuoteForSaveAndPdf();
    if (!newQuote) return;
    setIsGeneratingPdf(true);
    addQuote(newQuote);

    const primaryDoctor = quoteTreatments.length > 0
      ? doctors.find((d) => d.uid === quoteTreatments[0].doctorUid)
      : undefined;

    const primarySurgeonName = primaryDoctor
      ? primaryDoctor.name.startsWith('Dr.') ? primaryDoctor.name : `Dr. ${primaryDoctor.name}`
      : '';

    let derivedForPdf = derived;
    if (isDoctorUser && doctorSummary) {
      derivedForPdf = {
        ...derived,
        totalAfterDiscountUsd: doctorSummary.treatmentsSubtotal,
        totalAddOnsUsd: doctorSummary.addOnsSubtotal,
        subtotalUsd: doctorSummary.subtotal,
        vatUsd: doctorSummary.vat,
        grandTotalUsd: doctorSummary.grandTotal,
        depositUsd: doctorSummary.deposit,
        balanceUsd: doctorSummary.balance,
        multiTreatmentDiscountUsd: 0,
      };
    }

    const quoteDataForPdf: QuotePdfData = {
      patientName: newQuote.patientName,
      quoteDate: new Date().toLocaleDateString(),
      preparedBy: newQuote.createdBy.name,
      currency: newQuote.currency,
      vatPercent: newQuote.vatPercent,
      depositPercent: newQuote.depositPercent,
      treatments: quoteTreatments,
      addOns: quoteAddOns,
      derived: derivedForPdf,
      hospitalName: pdfMeta.hospitalName.trim(),
      surgeonName: primarySurgeonName,
      offerValidUntil: pdfMeta.offerValidUntil.trim(),
      depositDueUntil: pdfMeta.depositDueUntil.trim(),
    };

    try {
      await generateMultiPagePdf(quoteDataForPdf);
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      showNotification('Failed to generate PDF.', 'error');
    } finally {
      setIsGeneratingPdf(false);
      setIsPdfMetaOpen(false);
    }
  };

  const isSavable = selectedTreatments.length > 0 && patientName.trim() !== '';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        {Object.keys(errors).length > 0 && (
          <Alert type="error" message={`Please check fields: ${Object.values(errors).join(', ')}`} />
        )}

        {currentUser?.role === 'Doctor' && (
          <Card className="bg-blue-900/20 border-blue-800/50">
            <div className="flex items-center gap-3">
              <span className="text-2xl">👨‍⚕️</span>
              <p className="text-sm text-blue-200">
                Logged in as <strong>Doctor</strong>. You can only view and select treatments assigned to your code: <span className="font-mono bg-blue-900 px-1 rounded">{currentUser.doctorCode}</span>.
              </p>
            </div>
          </Card>
        )}

        {/* Patient & Quote Settings */}
        <Card title="Patient & Quote Settings">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Input
              label="Patient Name"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              error={errors.patientName}
              placeholder="Full Name"
            />
            <Select
              label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
            <NumberInput
              label="VAT %"
              value={vatPercent}
              min={0}
              onChange={(e) => setVatPercent(Number(e.target.value))}
              error={errors.vat}
            />
            <NumberInput
              label="Deposit %"
              value={depositPercent}
              min={0}
              max={100}
              onChange={(e) => setDepositPercent(Number(e.target.value))}
              error={errors.deposit}
            />
          </div>
        </Card>

        {/* Surgical Treatments */}
        <Card title="Surgical Treatments">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Select
              label="Filter by Doctor"
              value={doctorFilter}
              onChange={(e) => setDoctorFilter(e.target.value)}
              disabled={currentUser?.role === 'Doctor'}
            >
              <option value="All">All Doctors</option>
              {doctors.filter((d) => d.isActive).map((d) => (
                <option key={d.uid} value={d.code}>Dr. {d.name} ({d.code})</option>
              ))}
            </Select>

            <div className="relative" onBlur={() => setTimeout(() => setIsTreatmentDropdownOpen(false), 200)}>
              <label className="block text-sm font-medium text-slate-300 mb-1">Add Treatment</label>
              <div className="relative">
                <input
                  type="text"
                  className="block w-full pl-10 pr-3 py-2 border border-slate-600 bg-slate-700 text-slate-200 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm placeholder-slate-400"
                  placeholder="Search treatments..."
                  value={treatmentSearchTerm}
                  onChange={(e) => {
                    setTreatmentSearchTerm(e.target.value);
                    setIsTreatmentDropdownOpen(true);
                  }}
                  onFocus={() => setIsTreatmentDropdownOpen(true)}
                />
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
              
              {isTreatmentDropdownOpen && (
                <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-slate-600 bg-slate-800 shadow-xl">
                  {filteredTreatmentCatalog.length > 0 ? (
                    filteredTreatmentCatalog.map((t) => {
                      const isSelected = selectedTreatments.some(st => st.treatment.uid === t.uid);
                      return (
                        <button
                          key={t.uid}
                          type="button"
                          disabled={isSelected}
                          className={`block w-full text-left px-4 py-3 text-sm border-b border-slate-700 last:border-0 transition-colors
                            ${isSelected ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed' : 'text-slate-200 hover:bg-slate-700'}`}
                          onClick={() => {
                            handleAddTreatment(t.uid);
                            setTreatmentSearchTerm('');
                            setIsTreatmentDropdownOpen(false);
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-medium">{t.name}</span>
                            {!isSelected && <span className="text-teal-400 text-xs">+ Add</span>}
                            {isSelected && <span className="text-slate-500 text-xs">Selected</span>}
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="px-4 py-3 text-sm text-slate-400 text-center">No treatments found.</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {selectedTreatments.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-slate-700">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-800 text-slate-400 uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 font-medium text-left">Treatment</th>
                    <th className="px-4 py-3 font-medium text-left">Doctor</th>
                    <th className="px-4 py-3 font-medium text-center">Settings</th>
                    <th className="px-4 py-3 font-medium text-right">Price</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {quoteTreatments.map((t) => {
                    const uiState = treatmentDiscountMap[t.treatmentUid] || { isCombined: false, discountPercent: 0 };
                    
                    const multiplier = t.doctorMultiplier || 1;
                    const rawSalePrice = t.basePriceUsd * multiplier;
                    const rawBasePrice = t.basePriceUsd;
                    const startingPrice = isDoctorUser ? rawBasePrice : rawSalePrice;
                    const discount = uiState.discountPercent || 0;
                    const discountedPrice = startingPrice * (1 - discount / 100);
                    
                    const discountedBasePrice = t.basePriceUsd * (1 - discount / 100);

                    return (
                      <tr key={t.treatmentUid} className="hover:bg-slate-700/20 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-200">
                          {t.name}
                          {!isDoctorUser && (
                            <div className="text-xs text-slate-500 mt-0.5">
                              {formatCurrency(discountedBasePrice, 'USD', false)} base
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 w-64">
                          {isDoctorUser ? (
                            <div className="flex flex-col">
                              <span className="text-slate-200 font-medium">{doctors.find(d => d.uid === t.doctorUid)?.name}</span>
                              <span className="text-xs text-slate-500">{currentUser?.doctorCode}</span>
                            </div>
                          ) : (
                            <div className="space-y-1">
                                <div className="relative">
                                     <select
                                        value={t.doctorUid}
                                        onChange={(e) => handleDoctorChange(t.treatmentUid, e.target.value)}
                                        className="block w-full pl-2 pr-8 py-1.5 border border-slate-600 bg-slate-700 text-slate-200 rounded-md text-xs focus:ring-teal-500"
                                      >
                                        {doctors
                                          .filter((d) => d.departments.includes(t.department))
                                          .map((d) => (
                                            <option key={d.uid} value={d.uid}>{d.name}</option>
                                          ))}
                                      </select>
                                </div>
                              <div className="text-xs text-slate-500 text-right">x{t.doctorMultiplier} multiplier</div>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 w-48">
                          <div className="flex flex-col items-center gap-2">
                             <div className="flex items-center gap-2 bg-slate-800 p-1.5 rounded-md border border-slate-700">
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    className="h-3.5 w-3.5 rounded border-slate-500 bg-slate-700 text-teal-500 focus:ring-offset-0 focus:ring-teal-500"
                                    checked={uiState.isCombined}
                                    onChange={() => handleToggleCombined(t.treatmentUid)}
                                  />
                                  <span className="text-xs text-slate-300">Combined</span>
                                </label>
                                {uiState.isCombined && (
                                    <>
                                    <div className="w-px h-4 bg-slate-600 mx-1"></div>
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      className="w-12 p-0.5 text-center border-none bg-transparent text-slate-200 text-xs focus:ring-0 placeholder-slate-500"
                                      placeholder="0"
                                      value={uiState.discountPercent || ''}
                                      onChange={(e) => handleDiscountPercentChange(t.treatmentUid, Number(e.target.value))}
                                    />
                                    <span className="text-xs text-slate-400">%</span>
                                    </>
                                )}
                             </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="font-semibold text-slate-200">
                              {formatCurrency(discountedPrice, 'USD')}
                          </div>
                          
                          {discount > 0 ? (
                              <div className="text-xs text-emerald-400">-{discount}% applied</div>
                          ) : (
                              !isDoctorUser && t.appliedDiscountPercent > 0 && (
                                <div className="text-xs text-emerald-400">-{t.appliedDiscountPercent}% rule</div>
                              )
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => handleRemoveTreatment(t.treatmentUid)} className="text-slate-500 hover:text-red-400 transition-colors p-1 rounded-md hover:bg-slate-700">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="border border-dashed border-slate-700 rounded-lg p-8 text-center bg-slate-800/30">
                <div className="text-4xl mb-3">🏥</div>
                <h3 className="text-slate-300 font-medium">No treatments selected</h3>
                <p className="text-slate-500 text-sm mt-1">Use the search box above to add surgical procedures.</p>
            </div>
          )}
        </Card>

        {/* Accommodation & Services */}
        <Card title="Accommodation & Services">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-slate-800/50 p-4 rounded-md border border-slate-700 flex justify-between items-center">
              <div>
                <p className="text-xs text-slate-400 uppercase font-semibold">Hospital Nights</p>
                <p className="text-sm text-slate-500">(Auto-calculated)</p>
              </div>
              <p className="text-2xl font-bold text-teal-500">{derived.totalHospitalNights} <span className="text-sm font-normal text-slate-400">nights</span></p>
            </div>
            
            <NumberInput
              label="Min Stay in Türkiye"
              value={hotelNights}
              onChange={(e) => setHotelNights(Number(e.target.value))}
              min={minHotelStay}
              error={errors.hotelNights}
            />
          </div>
          
          <div className="mb-4">
             <label className="block text-sm font-medium text-slate-300 mb-1">Add Service / Add-on</label>
             <select
                onChange={(e) => handleAddAddOn(e.target.value)}
                value=""
                className="block w-full px-3 py-2 border border-slate-600 bg-slate-700 text-slate-200 rounded-md shadow-sm focus:outline-none focus:ring-teal-500"
              >
                <option value="" disabled>-- Select a service --</option>
                {addOnCatalog.map((a) => (
                  <option key={a.uid} value={a.uid}>{a.name} {/* <-- Sadece isim kaldı */}</option>
                ))}
              </select>
          </div>

          {quoteAddOns.length > 0 ? (
             <div className="overflow-x-auto rounded-lg border border-slate-700">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-800 text-slate-400 uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 font-medium text-left">Service</th>
                    <th className="px-4 py-3 font-medium text-left">Unit Price</th>
                    <th className="px-4 py-3 font-medium text-left">Qty</th>
                    <th className="px-4 py-3 font-medium text-right">Total</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {quoteAddOns.map((a) => (
                    <tr key={a.addOnUid} className="hover:bg-slate-700/20">
                      <td className="px-4 py-3 font-medium text-slate-200">{a.name}</td>
                      <td className="px-4 py-3 text-slate-400">{formatCurrency(a.unitPriceUsd, 'USD')}</td>
                      <td className="px-4 py-3 w-24">
                        <input
                          type="number"
                          className="w-full p-1 text-center border rounded-md bg-slate-700 border-slate-600 text-slate-200 focus:ring-teal-500"
                          value={a.quantity}
                          onChange={(e) => handleAddonQuantityChange(a.addOnUid, Number(e.target.value))}
                          min={0}
                        />
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-200">{formatCurrency(a.lineTotalUsd, 'USD')}</td>
                       <td className="px-4 py-3 text-right">
                          <button onClick={() => handleRemoveAddOn(a.addOnUid)} className="text-slate-500 hover:text-red-400 transition-colors p-1 rounded-md hover:bg-slate-700">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-4 text-slate-500 border border-dashed border-slate-700 rounded-lg">No add-ons selected.</div>
          )}
        </Card>
      </div>

      {/* SUMMARY SIDEBAR */}
      <div className="lg:col-span-1">
        <Card title="Quote Summary" className="sticky top-24 border-t-4 border-t-teal-500">
          
          {/* ✅ YENİ: SADECE ADMIN VE TEAM İÇİN TOPLAM BASE PRICE GÖSTERİMİ */}
          {!isDoctorUser && totalBaseCost > 0 && (
            <div className="mb-5 p-3 bg-slate-800 border border-dashed border-slate-600 rounded-md relative overflow-hidden">
              <div className="absolute top-0 right-0 p-2 opacity-10 text-4xl">💰</div>
              
              <div className="flex justify-between items-center text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">
                <span>Internal Cost</span>
              </div>
              
              <div className="flex justify-between items-end">
                <div>
                  <span className="text-xs text-slate-500 block">Total Base Price</span>
                  <span className="text-lg font-mono font-bold text-slate-300">
                    {formatCurrency(totalBaseCost, currency)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500 block">Est. Profit</span>
                  <span className="text-sm font-mono font-bold text-emerald-400">
                    +{formatCurrency(derived.subtotalUsd - totalBaseCost, currency)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3 text-slate-300 mt-2">
            <div className="flex justify-between items-center text-sm">
              <span>Treatments Subtotal</span>
              <span className="font-medium text-slate-200">{formatCurrency(isDoctorUser && doctorSummary ? doctorSummary.treatmentsSubtotal : derived.totalAfterDiscountUsd, currency)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span>Add-ons Subtotal</span>
              <span className="font-medium text-slate-200">{formatCurrency(isDoctorUser && doctorSummary ? doctorSummary.addOnsSubtotal : derived.totalAddOnsUsd, currency)}</span>
            </div>
            
            <div className="border-t border-slate-700 my-2"></div>

            <div className="flex justify-between items-center font-bold text-slate-100">
              <span>Subtotal</span>
              <span>{formatCurrency(isDoctorUser && doctorSummary ? doctorSummary.subtotal : derived.subtotalUsd, currency)}</span>
            </div>

            {!isDoctorUser && multiTreatmentDiscountValue > 0 && (
              <div className="flex justify-between items-center text-sm bg-red-500/10 p-2 rounded text-red-400">
                <span>Multi-treatment Disc.</span>
                <span>-{formatCurrency(multiTreatmentDiscountValue, currency)}</span>
              </div>
            )}

            <div className="flex justify-between items-center text-sm">
              <span>VAT ({vatPercent}%)</span>
              <span>{formatCurrency(isDoctorUser && doctorSummary ? doctorSummary.vat : derived.vatUsd, currency)}</span>
            </div>
            
            <div className="border-t border-slate-600 my-4"></div>

            <div className="flex justify-between items-center text-xl font-bold text-white">
              <span>Grand Total</span>
              <span>{formatCurrency(isDoctorUser && doctorSummary ? doctorSummary.grandTotal : derived.grandTotalUsd, currency)}</span>
            </div>

            <div className="bg-teal-500/10 p-3 rounded-md mt-2 border border-teal-500/30">
                <div className="flex justify-between items-center text-teal-400 font-bold">
                <span>Deposit Due ({depositPercent}%)</span>
                <span>{formatCurrency(isDoctorUser && doctorSummary ? doctorSummary.deposit : derived.depositUsd, currency)}</span>
                </div>
            </div>

            <div className="flex justify-between items-center text-sm pt-1">
              <span>Balance Due</span>
              <span className="text-slate-400">{formatCurrency(isDoctorUser && doctorSummary ? doctorSummary.balance : derived.balanceUsd, currency)}</span>
            </div>
          </div>

          <div className="mt-8 space-y-3">
            <button
              onClick={handleSaveQuote}
              disabled={!isSavable}
              className="w-full bg-teal-600 text-white py-3 px-4 rounded-md hover:bg-teal-500 font-medium shadow-lg shadow-teal-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Quote
            </button>
            <button
              onClick={handleOpenPdfMeta}
              disabled={!isSavable || isGeneratingPdf}
              className="w-full bg-slate-700 text-slate-200 py-3 px-4 rounded-md hover:bg-slate-600 font-medium border border-slate-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
            >
              {isGeneratingPdf ? (
                 <>
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Generating...
                 </>
              ) : 'Save & Download PDF'}
            </button>
          </div>
        </Card>
      </div>

      {/* PDF DETAILS MODAL */}
      {isPdfMetaOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden">
            <div className="bg-slate-800 px-6 py-4 border-b border-slate-700">
                <h2 className="text-lg font-bold text-white">PDF Configuration</h2>
                <p className="text-xs text-slate-400">Customize fields for the patient offer PDF.</p>
            </div>
            
            <div className="p-6 space-y-5">
              
              <div>
                <label className="block text-xs uppercase font-bold text-slate-500 mb-1.5">Hospital Name</label>
                <select
                  className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-slate-200 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors"
                  value={pdfMeta.hospitalName}
                  onChange={(e) => setPdfMeta((prev) => ({ ...prev, hospitalName: e.target.value }))}
                >
                  <option value="" disabled>Select a hospital</option>
                  {hospitals.length > 0 ? (
                    hospitals.map((h) => (
                      <option key={h.id} value={h.name}>{h.name}</option>
                    ))
                  ) : (
                    <option value="" disabled>No hospitals added yet</option>
                  )}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase font-bold text-slate-500 mb-1.5">Offer Valid Until</label>
                  <input
                    type="text"
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-slate-200 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors"
                    value={pdfMeta.offerValidUntil}
                    onChange={(e) => setPdfMeta((prev) => ({ ...prev, offerValidUntil: e.target.value }))}
                  />
                  <p className="text-[10px] text-slate-500 mt-1 text-right">+15 Days</p>
                </div>
                <div>
                  <label className="block text-xs uppercase font-bold text-slate-500 mb-1.5">Deposit Due Date</label>
                  <input
                    type="text"
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-slate-200 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors"
                    value={pdfMeta.depositDueUntil}
                    onChange={(e) => setPdfMeta((prev) => ({ ...prev, depositDueUntil: e.target.value }))}
                  />
                  <p className="text-[10px] text-slate-500 mt-1 text-right">+30 Days</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 px-6 py-4 flex justify-end gap-3 border-t border-slate-700">
              <button
                onClick={() => setIsPdfMetaOpen(false)}
                className="px-4 py-2 rounded-md text-slate-300 hover:text-white hover:bg-slate-700 transition-colors text-sm font-medium"
                disabled={isGeneratingPdf}
              >
                Cancel
              </button>
              <button
                onClick={handleGeneratePdf}
                disabled={isGeneratingPdf}
                className="px-6 py-2 rounded-md bg-teal-600 text-white text-sm font-bold hover:bg-teal-500 shadow-lg shadow-teal-900/30 transition-all flex items-center gap-2"
              >
                {isGeneratingPdf ? 'Processing...' : 'Generate PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PriceCalculatorPage;