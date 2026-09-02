import React, { useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { Quote, QuoteTreatment, QuoteAddOn, User } from '../types/entities';
import { useAppContext } from '../context/AppContext';

// -----------------------------
// Helpers
// -----------------------------
const toSafeNumber = (value: any, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return fallback;
};

const formatCurrency = (value: number | undefined, currency: string = 'USD') => {
  const safe = toSafeNumber(value, 0);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(safe);
};

const getCurrency = (quote: Quote) =>
  (quote as any).currency || (quote as any).settings?.currency || 'USD';

const getVatPercent = (quote: Quote) =>
  (quote as any).vatPercent ??
  (quote as any).settings?.vatPercent ??
  0;

const getDepositPercent = (quote: Quote) =>
  (quote as any).depositPercent ??
  (quote as any).settings?.depositPercent ??
  0;

const getDerivedSafe = (quote: Quote) => {
  const raw = (quote as any).derived || {};
  const totalAfterDiscountUsd = toSafeNumber(raw.totalAfterDiscountUsd, 0);
  const totalAddOnsUsd = toSafeNumber(raw.totalAddOnsUsd, 0);
  const subtotalUsd = toSafeNumber(raw.subtotalUsd, totalAfterDiscountUsd + totalAddOnsUsd);
  const vatUsd = toSafeNumber(raw.vatUsd, 0);
  const grandTotalUsd = toSafeNumber(raw.grandTotalUsd, subtotalUsd + vatUsd);
  const depositUsd = toSafeNumber(raw.depositUsd, 0);
  const balanceUsd = toSafeNumber(raw.balanceUsd, grandTotalUsd - depositUsd);
  const multiTreatmentDiscountUsd = toSafeNumber(raw.multiTreatmentDiscountUsd ?? 0, 0);
  const totalHospitalNights = toSafeNumber(raw.totalHospitalNights ?? 0, 0);

  return {
    totalAfterDiscountUsd,
    totalAddOnsUsd,
    subtotalUsd,
    vatUsd,
    grandTotalUsd,
    depositUsd,
    balanceUsd,
    multiTreatmentDiscountUsd,
    totalHospitalNights,
  };
};

const getTreatments = (quote: Quote): QuoteTreatment[] =>
  ((quote as any).treatments || (quote as any).selectedTreatments || []) as QuoteTreatment[];

const getAddOns = (quote: Quote): QuoteAddOn[] =>
  ((quote as any).addOns || (quote as any).selectedAddOns || []) as QuoteAddOn[];

const getTreatmentDoctorLabel = (t: any): string => {
  const doc = t.doctorName || (t as any).doctor;
  
  if (typeof doc === 'object' && doc !== null) {
      return doc.name || '-';
  }
  return String(doc || '-');
};

const getCreatorName = (quote: Quote, users: User[]): string => {
  let source = (quote as any).createdBy || (quote as any).userId;
  
  if (!source) return '-';

  if (typeof source === 'object') {
      return source.name || source.email || 'Unknown';
  }

  const user = users.find(u => u.email === source || u.uid === source);
  
  return user ? user.name : String(source);
};

// -----------------------------
// MAIN PAGE
// -----------------------------
const QuotesHistoryPage: React.FC = () => {
  const { quotes, deleteQuote, currentUser, users } = useAppContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const canDelete = currentUser?.role === 'Admin';

  // Filtre + sıralama
  const filteredQuotes = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const list = [...quotes];

    list.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });

    if (!term) return list;

    return list.filter((q) =>
      (q.patientName || '').toString().toLowerCase().includes(term) ||
      getCreatorName(q, users).toLowerCase().includes(term)
    );
  }, [quotes, searchTerm, users]);

  const openDetails = (quote: Quote) => {
    setSelectedQuote(quote);
    setOpenMenuId(null);
  };

  const handleDelete = (id: string) => {
    if (!canDelete) return;
    
    if (!id) {
        console.error("Hata: Silinecek Quote ID'si bulunamadı.");
        return;
    }

    if (!window.confirm('Are you sure you want to delete this quote?')) return;
    
    deleteQuote(id);
    setOpenMenuId(null);
  };

  // -----------------------------
  // PDF DOWNLOAD
  // -----------------------------
  const handleDownload = (quote: Quote) => {
    const doc = new jsPDF();

    const currency = getCurrency(quote);
    const vatPercent = getVatPercent(quote);
    const depositPercent = getDepositPercent(quote);
    const treatments = getTreatments(quote);
    const addOns = getAddOns(quote);
    const derived = getDerivedSafe(quote);
    const creatorName = getCreatorName(quote, users);

    const created =
      quote.createdAt && !Number.isNaN(new Date(quote.createdAt).getTime())
        ? new Date(quote.createdAt).toLocaleString()
        : '-';

    let y = 10;
    const lineGap = 6;

    const addLine = (text: string, bold = false) => {
      if (y > 280) {
        doc.addPage();
        y = 10;
      }
      doc.setFont(undefined, bold ? 'bold' : 'normal');
      doc.text(text, 10, y);
      y += lineGap;
    };

    // Header
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text('Surgero - Treatment Quote', 10, y);
    y += 10;

    doc.setFontSize(11);
    addLine(`Quote ID: ${quote.id || '-'}`);
    addLine(`Created: ${created}`);
    addLine(`Created By: ${creatorName}`);
    addLine(`Patient: ${quote.patientName || '-'}`);
    addLine(`Currency: ${currency}`);
    addLine(`VAT: ${vatPercent}%`);
    addLine(`Deposit: ${depositPercent}%`);
    y += 4;

    // Treatments
    addLine('Treatments', true);
    if (!treatments.length) {
      addLine('  - No treatments');
    } else {
      treatments.forEach((t: any, index: number) => {
        const name =
          t.treatmentName ||
          t.name ||
          (t.treatment as string) ||
          `Treatment ${index + 1}`;
        const doctorLabel = getTreatmentDoctorLabel(t);

        const finalPriceUsd = toSafeNumber(
          t.finalPriceUsd ??
            t.priceUsd ??
            t.totalUsd ??
            0,
          0
        );

        addLine(`  • ${name}`);
        addLine(`      Doctor: ${doctorLabel}`);
        addLine(
          `      Price: ${formatCurrency(finalPriceUsd, currency)}`
        );
      });
    }
    y += 4;

    // Add-ons
    addLine('Add-ons', true);
    if (!addOns.length) {
      addLine('  - No add-ons');
    } else {
      addOns.forEach((a: any, index: number) => {
        const name =
          a.addOnName ||
          a.name ||
          a.service ||
          `Add-on ${index + 1}`;

        const quantity = toSafeNumber(a.quantity ?? 1, 1);
        const lineTotalUsd = toSafeNumber(
          a.lineTotalUsd ??
            a.totalUsd ??
            a.totalPriceUsd ??
            (a.unitPriceUsd ?? 0) * quantity,
          0
        );

        addLine(`  • ${name}`);
        addLine(`      Quantity: ${quantity}`);
        addLine(
          `      Total: ${formatCurrency(lineTotalUsd, currency)}`
        );
      });
    }
    y += 4;

    // Summary
    addLine('Summary', true);
    addLine(
      `  Treatments subtotal: ${formatCurrency(derived.totalAfterDiscountUsd, currency)}`
    );
    addLine(
      `  Add-ons subtotal: ${formatCurrency(derived.totalAddOnsUsd, currency)}`
    );
    if (derived.multiTreatmentDiscountUsd > 0) {
      addLine(
        `  Multi-treatment discount: -${formatCurrency(
          derived.multiTreatmentDiscountUsd,
          currency
        )}`
      );
    }
    addLine(
      `  VAT: ${formatCurrency(derived.vatUsd, currency)}`
    );
    addLine(
      `  Grand total: ${formatCurrency(derived.grandTotalUsd, currency)}`
    );
    addLine(
      `  Deposit: ${formatCurrency(derived.depositUsd, currency)}`
    );
    addLine(
      `  Balance: ${formatCurrency(derived.balanceUsd, currency)}`
    );
    y += 4;

    const fileName = `quote-${quote.id || 'surgero'}.pdf`;
    doc.save(fileName);

    setOpenMenuId(null);
  };

  // -----------------------------
  // RENDER
  // -----------------------------
  return (
    <div className="p-6 text-gray-100">
      <h1 className="text-xl font-semibold mb-4">Saved Quotes History</h1>

      {/* Search */}
      <div className="mb-4 max-w-md">
        <label className="block text-sm mb-1">Search by Patient or Creator</label>
        <input
          type="text"
          className="w-full rounded-md bg-slate-800 border border-slate-600 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="e.g. John Doe"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900 overflow-visible">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-800 text-slate-300">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3 text-left font-medium">Patient Name</th>
              <th className="px-4 py-3 text-left font-medium">Created By</th>
              <th className="px-4 py-3 text-left font-medium">Currency</th>
              <th className="px-4 py-3 text-right font-medium">Grand Total</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredQuotes.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-6 text-center text-slate-400"
                >
                  No quotes saved yet.
                </td>
              </tr>
            )}

            {filteredQuotes.map((quote) => {
              const currency = getCurrency(quote);
              const created =
                quote.createdAt &&
                !Number.isNaN(new Date(quote.createdAt).getTime())
                  ? new Date(quote.createdAt).toLocaleDateString()
                  : '-';
              
              const creatorName = getCreatorName(quote, users);
              const derived = getDerivedSafe(quote);

              return (
                <tr
                  key={quote.id}
                  className="border-t border-slate-800 hover:bg-slate-800/60"
                >
                  <td className="px-4 py-3 align-middle text-slate-300">
                    {created}
                  </td>
                  <td className="px-4 py-3 align-middle font-medium text-white">
                    {quote.patientName || '-'}
                  </td>
                  <td className="px-4 py-3 align-middle text-slate-300">
                    <span className="bg-slate-700/50 px-2 py-1 rounded text-xs border border-slate-600/50">
                        {creatorName}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    {currency}
                  </td>
                  <td className="px-4 py-3 align-middle text-right font-mono text-emerald-400">
                    {formatCurrency(derived.grandTotalUsd, currency)}
                  </td>
                  <td className="px-4 py-3 align-middle text-right relative">
                    <button
                      onClick={() =>
                        setOpenMenuId(
                          openMenuId === quote.id ? null : quote.id
                        )
                      }
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200"
                    >
                      <span className="sr-only">Open actions</span>
                      <span className="flex flex-col gap-[2px]">
                        <span className="h-[2px] w-[2px] rounded-full bg-slate-200" />
                        <span className="h-[2px] w-[2px] rounded-full bg-slate-200" />
                        <span className="h-[2px] w-[2px] rounded-full bg-slate-200" />
                      </span>
                    </button>

                    {openMenuId === quote.id && (
                      <div className="absolute right-0 mt-2 w-40 rounded-md bg-slate-800 border border-slate-700 shadow-lg z-50">
                        <button
                          className="w-full px-3 py-2 text-left text-sm hover:bg-slate-700 text-slate-200"
                          onClick={() => openDetails(quote)}
                        >
                          View
                        </button>
                        <button
                          className="w-full px-3 py-2 text-left text-sm hover:bg-slate-700 text-slate-200"
                          onClick={() => handleDownload(quote)}
                        >
                          Download
                        </button>
                        {canDelete && (
                          <button
                            className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-700 hover:text-red-300"
                            onClick={() => handleDelete(quote.id)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Details modal */}
      {selectedQuote && (
        <QuoteDetailsModal
          quote={selectedQuote}
          onClose={() => setSelectedQuote(null)}
          currentUserRole={currentUser?.role}
        />
      )}
    </div>
  );
};

// -----------------------------
// DETAILS MODAL
// -----------------------------
interface DetailsProps {
  quote: Quote;
  onClose: () => void;
  currentUserRole?: string;
}

const QuoteDetailsModal: React.FC<DetailsProps> = ({ quote, onClose, currentUserRole }) => {
  const currency = getCurrency(quote);
  const derived = getDerivedSafe(quote);
  const treatments = getTreatments(quote);
  const addOns = getAddOns(quote);

  // ✅ Toplam Base Price Hesaplama (İndirimli)
  const totalBaseCost = useMemo(() => {
    if (currentUserRole === 'Doctor') return 0; // Doktorlar görmemeli

    const treatmentsBase = treatments.reduce((sum, t: any) => {
        const basePrice = toSafeNumber(t.basePriceUsd, 0);
        const discount = toSafeNumber(t.appliedDiscountPercent, 0);
        return sum + (basePrice * (1 - discount / 100));
    }, 0);
    
    const addOnsBase = addOns.reduce((sum, a: any) => {
        const unit = toSafeNumber(a.unitPriceUsd, 0);
        const qty = toSafeNumber(a.quantity, 0);
        return sum + (unit * qty);
    }, 0);

    return treatmentsBase + addOnsBase;
  }, [treatments, addOns, currentUserRole]);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-lg bg-slate-900 border border-slate-700 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-700 px-5 py-3 sticky top-0 bg-slate-900 z-10">
          <h2 className="text-lg font-semibold text-white">
            Details for Quote #{quote.id?.slice(0, 8) || '—'}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-6 text-sm">
          {/* Patient & Settings */}
          <section>
            <h3 className="font-semibold mb-2 text-emerald-400">Patient &amp; Settings</h3>
            <div className="grid grid-cols-2 gap-x-12 gap-y-1 text-slate-300">
              <div>
                <div className="text-xs text-slate-500">Patient:</div>
                <div className="font-medium text-white">{quote.patientName || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Currency:</div>
                <div>{currency}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">VAT:</div>
                <div>{getVatPercent(quote)}%</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Deposit:</div>
                <div>{getDepositPercent(quote)}%</div>
              </div>
            </div>
          </section>

          {/* Treatments */}
          <section>
            <h3 className="font-semibold mb-2 text-emerald-400">Treatments</h3>
            <table className="w-full text-xs">
              <thead className="border-b border-slate-700 text-slate-400">
                <tr>
                  <th className="py-2 text-left font-medium">Treatment</th>
                  <th className="py-2 text-left font-medium">Doctor</th>
                  <th className="py-2 text-right font-medium">Base price (USD)</th>
                  <th className="py-2 text-right font-medium">After markup (USD)</th>
                  <th className="py-2 text-right font-medium">Discount</th>
                  <th className="py-2 text-right font-medium">Final price (USD)</th>
                </tr>
              </thead>
              <tbody>
                {!treatments.length && (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-3 text-center text-slate-500"
                    >
                      No treatments.
                    </td>
                  </tr>
                )}
                {treatments.map((t: any, idx: number) => {
                  const name =
                    t.treatmentName ||
                    t.name ||
                    (t.treatment as string) ||
                    '-';
                  const doctorLabel = getTreatmentDoctorLabel(t);

                  const basePriceUsd = toSafeNumber(
                    t.basePriceUsd ?? t.priceUsd ?? 0,
                    0
                  );
                  const saleBasePriceUsd = toSafeNumber(
                    t.saleBasePriceUsd ?? basePriceUsd,
                    basePriceUsd
                  );
                  const discountPercent = toSafeNumber(
                    t.appliedDiscountPercent ?? 0,
                    0
                  );
                  const finalPriceUsd = toSafeNumber(
                    t.finalPriceUsd ??
                      saleBasePriceUsd * (1 - discountPercent / 100),
                    0
                  );

                  const discountLabel =
                    discountPercent > 0
                      ? `${discountPercent.toFixed(0)}%`
                      : '—';

                  return (
                    <tr key={idx} className="border-b border-slate-800 text-slate-300">
                      <td className="py-2">{name}</td>
                      <td className="py-2">{doctorLabel}</td>
                      <td className="py-2 text-right">
                        {formatCurrency(basePriceUsd, 'USD')}
                      </td>
                      <td className="py-2 text-right">
                        {formatCurrency(saleBasePriceUsd, 'USD')}
                      </td>
                      <td className="py-2 text-right">{discountLabel}</td>
                      <td className="py-2 text-right font-semibold text-white">
                        {formatCurrency(finalPriceUsd, 'USD')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {/* Add-ons */}
          <section>
            <h3 className="font-semibold mb-2 text-emerald-400">Add-ons</h3>
            <table className="w-full text-xs">
              <thead className="border-b border-slate-700 text-slate-400">
                <tr>
                  <th className="py-2 text-left font-medium">Service</th>
                  <th className="py-2 text-center font-medium">Quantity</th>
                  <th className="py-2 text-right font-medium">Unit price (USD)</th>
                  <th className="py-2 text-right font-medium">Line total (USD)</th>
                </tr>
              </thead>
              <tbody>
                {!addOns.length && (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-3 text-center text-slate-500"
                    >
                      No add-ons.
                    </td>
                  </tr>
                )}
                {addOns.map((a: any, idx: number) => {
                  const name =
                    a.addOnName ||
                    a.name ||
                    a.service ||
                    '-';
                  const quantity = toSafeNumber(a.quantity ?? 1, 1);
                  const unitPriceUsd = toSafeNumber(
                    a.unitPriceUsd ?? a.priceUsd ?? a.basePriceUsd ?? 0,
                    0
                  );
                  const lineTotalUsd = toSafeNumber(
                    a.lineTotalUsd ??
                      a.totalUsd ??
                      a.totalPriceUsd ??
                      unitPriceUsd * quantity,
                    0
                  );

                  return (
                    <tr key={idx} className="border-b border-slate-800 text-slate-300">
                      <td className="py-2">{name}</td>
                      <td className="py-2 text-center">{quantity}</td>
                      <td className="py-2 text-right">
                        {formatCurrency(unitPriceUsd, 'USD')}
                      </td>
                      <td className="py-2 text-right font-semibold text-white">
                        {formatCurrency(lineTotalUsd, 'USD')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {/* Summary */}
          <section className="bg-slate-800/50 p-4 rounded-lg">
            <h3 className="font-semibold mb-2 text-emerald-400">Summary</h3>
            
            {/* ✅ YENİ: Internal Cost Bölümü (Sadece Admin/Team) */}
            {currentUserRole !== 'Doctor' && totalBaseCost > 0 && (
                <div className="mb-4 p-3 bg-slate-800 border border-dashed border-slate-600 rounded-md relative overflow-hidden">
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

            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Treatments subtotal:</span>
                <span className="text-white">{formatCurrency(derived.totalAfterDiscountUsd, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Add-ons subtotal:</span>
                <span className="text-white">{formatCurrency(derived.totalAddOnsUsd, currency)}</span>
              </div>
              {derived.multiTreatmentDiscountUsd > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Multi-treatment discount:</span>
                  <span className="text-red-400">
                    -{formatCurrency(Math.abs(derived.multiTreatmentDiscountUsd), currency)}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">VAT:</span>
                <span className="text-white">{formatCurrency(derived.vatUsd, currency)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-700 mt-2">
                <span className="text-white font-medium">Grand Total:</span>
                <span className="font-bold text-emerald-400 text-lg">
                  {formatCurrency(derived.grandTotalUsd, currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-emerald-400/80">Deposit:</span>
                <span className="text-emerald-400/80">
                  {formatCurrency(derived.depositUsd, currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Balance:</span>
                <span className="text-white">{formatCurrency(derived.balanceUsd, currency)}</span>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
};

export default QuotesHistoryPage;