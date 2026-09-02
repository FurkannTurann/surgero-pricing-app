import {
  QuoteTreatment,
  QuoteAddOn,
  QuoteDerivedValues,
  Currency,
} from '../types/entities';
import { formatCurrency } from './helpers';

// These variables are loaded from CDN scripts in index.html
declare const PDFLib: any;
declare const fontkit: any;

const { PDFDocument, PageSizes, rgb } = PDFLib;

// Portfolio-safe assets are served locally. Proprietary PDF templates are intentionally omitted.

// --- Data Transfer Object ---
export interface QuotePdfData {
  patientName: string;
  quoteDate: string;
  preparedBy: string;
  currency: Currency;
  vatPercent: number;
  depositPercent: number;
  treatments: QuoteTreatment[];
  addOns: QuoteAddOn[];
  derived: QuoteDerivedValues & {
    multiTreatmentDiscountUsd?: number;
    hotelName?: string;
  };

  hospitalName?: string;
  surgeonName?: string;
  offerValidUntil?: string;
  depositDueUntil?: string;
}

// ============================
// LAYOUT CONSTANTS
// ============================

// Cover Page (Page 1)
const COVER_VALUE_LEFT_X = 320;
const COVER_FONT_SIZE = 12;
const COVER_TOP_ROW_Y = 315;
const COVER_ROW_HEIGHT = 35;

// Quote Page (Page 2)
const LEFT_MARGIN = 50;
const RIGHT_MARGIN = 50;
const BODY_LINE_HEIGHT = 10;
const SECTION_GAP = 18;
const TITLE_SIZE = 12;
const BODY_SIZE = 8;
const TERMS_LABEL_SIZE = 9;
const TERMS_BODY_SIZE = 8;

const TEXT_COLOR = rgb(0, 0, 0);
const SURGERO_BLUE_COLOR = rgb(151 / 255, 194 / 255, 228 / 255);
const PRIMARY_COLOR = rgb(0.2, 0.5, 0.5);
const SECONDARY_TEXT_COLOR = rgb(0.3, 0.3, 0.3);

// Colors
const DARK_BG_COLOR = rgb(0x0a / 255, 0x0b / 255, 0x1c / 255);
const WHITE = rgb(1, 1, 1);

// Logo
const LOGO_PATH = '/pdf/surgero_logo.png';
const LOGO_TOP_MARGIN = 16;
const LOGO_WIDTH = 180;

// OFFER bar
const OFFER_BAR_HEIGHT = 40;

// ============================
// HELPERS
// ============================

const addPdfPageFromUrl = async (pdfDoc: any, url: string) => {
  try {
    console.log('[PDF] Trying to load template from:', url);

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch ${url}. Status: ${res.status}`);
    }

    const pageBytes = await res.arrayBuffer();
    const templateDoc = await PDFDocument.load(pageBytes);
    const [templatePage] = await pdfDoc.copyPages(templateDoc, [0]);
    const page = pdfDoc.addPage(templatePage);

    console.log('[PDF] Template loaded successfully from:', url);
    return page;
  } catch (error) {
    console.error(
      `Could not load or add page from ${url}. Falling back to blank A4 page.`,
      error
    );
    // Şablon yüklenemezse bile boş A4 sayfa ekleyelim ki PDF üretimi çökmesin
    const page = pdfDoc.addPage(PageSizes.A4);
    return page;
  }
};

const sanitizePatientName = (name: string | undefined | null): string =>
  (name || 'surgero').replace(/[^a-z0-9]/gi, '_').toLowerCase();

// Tarihi sayısal formata çevir (dd.MM.yyyy). Metinsel tarihleri de deniyor.
const formatNumericDate = (raw: string | undefined | null): string => {
  if (!raw) return '';
  const trimmed = raw.trim();

  // Zaten sayısal formatta ise dokunma
  if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(trimmed)) {
    return trimmed;
  }

  // "16th of December, 2025" gibi formatları temizle
  let cleaned = trimmed;
  cleaned = cleaned.replace(/\bof\b/gi, ' ');
  cleaned = cleaned.replace(/(\d+)(st|nd|rd|th)/gi, '$1');

  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) {
    const d = String(parsed.getDate()).padStart(2, '0');
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const y = parsed.getFullYear();
    return `${d}.${m}.${y}`;
  }

  // Parse edemezse, orijinali döndür
  return trimmed;
};

const getDepartmentCode = (data: QuotePdfData): string => {
  const first = data.treatments?.[0];
  if (!first) return 'GEN';

  const dept = (first as any).department
    ? String((first as any).department).toLowerCase()
    : '';

  if (!dept) return 'GEN';

  if (
    dept.includes('plastic') ||
    dept.includes('aesthetic') ||
    dept.includes('body') ||
    dept.includes('breast')
  ) {
    return 'PS';
  }
  if (
    dept.includes('face') ||
    dept.includes('rhinoplasty') ||
    dept.includes('nose')
  ) {
    return 'FS';
  }
  if (
    dept.includes('dental') ||
    dept.includes('tooth') ||
    dept.includes('teeth')
  ) {
    return 'DS';
  }
  if (dept.includes('hair')) {
    return 'HS';
  }
  if (
    dept.includes('weight') ||
    dept.includes('obesity') ||
    dept.includes('bariatric')
  ) {
    return 'WS';
  }

  return 'GEN';
};

const getNextSerial = (): string => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return '001';
    }
    const key = 'surgeroQuoteSerial';
    const raw = window.localStorage.getItem(key);
    const current = raw ? parseInt(raw, 10) : 0;
    const next = Number.isFinite(current) ? current + 1 : 1;
    window.localStorage.setItem(key, String(next));
    return String(next).padStart(3, '0'); // 001, 002, ...
  } catch (err) {
    console.error('Failed to read/write quote serial from localStorage', err);
    return '001';
  }
};

// ============================
// QUOTE (MIDDLE PAGE) LAYOUT
// ============================

const drawQuotePage = async (
  pdfDoc: any,
  page: any,
  data: QuotePdfData,
  fonts: { regular: any; bold: any },
  offerNumber: string
) => {
  const { width, height } = page.getSize();
  const contentLeft = LEFT_MARGIN;
  const contentRight = width - RIGHT_MARGIN;

  const { regular: regularFont, bold: boldFont } = fonts;

  const hospitalValue = data.hospitalName || '—';
  const surgeonValue = data.surgeonName || '—';

  // ---------- LOGO ----------
  let afterLogoY: number;

  try {
    const logoBytes = await fetch(LOGO_PATH).then((res) => res.arrayBuffer());
    const logoImage = await pdfDoc.embedPng(logoBytes);

    const logoDims = logoImage.scaleToFit(LOGO_WIDTH, 80);
    const logoX = (width - logoDims.width) / 2;
    const logoY = height - LOGO_TOP_MARGIN - logoDims.height;

    page.drawImage(logoImage, {
      x: logoX,
      y: logoY,
      width: logoDims.width,
      height: logoDims.height,
    });

    afterLogoY = logoY - 6;
  } catch (err) {
    console.error('Logo could not be drawn:', err);
    const fallbackY = height - 40;
    page.drawText('surgero', {
      x: contentLeft,
      y: fallbackY,
      font: boldFont,
      size: 16,
      color: SURGERO_BLUE_COLOR,
    });
    afterLogoY = fallbackY - BODY_LINE_HEIGHT;
  }

  // ---------- OFFER BAR ----------
  const barTop = afterLogoY;
  const barBottom = barTop - OFFER_BAR_HEIGHT;
  const barLeft = contentLeft;
  const barWidth = contentRight - contentLeft;

  page.drawRectangle({
    x: barLeft,
    y: barBottom,
    width: barWidth,
    height: OFFER_BAR_HEIGHT,
    color: DARK_BG_COLOR,
  });

  const segmentCount = 4;
  const segmentWidth = barWidth / segmentCount;

  const titleSize = 10;
  const valueSize = 10;

  const titleFont = boldFont;
  const valueFont = regularFont;

  const titleY = barBottom + OFFER_BAR_HEIGHT - 14;
  const valueY = barBottom + 8;

  const HEADER_X_OFFSET = -6;

  // OFFER
  {
    const text = 'OFFER';
    const textWidth = titleFont.widthOfTextAtSize(text, 14);
    const segXBase = barLeft + segmentWidth * 0;
    const x = segXBase + (segmentWidth - textWidth) / 2 + HEADER_X_OFFSET;
    const yOffer = barBottom + OFFER_BAR_HEIGHT / 2 - 5;
    page.drawText(text, {
      x,
      y: yOffer,
      font: titleFont,
      size: 14,
      color: WHITE,
    });
  }

  const offerNumberText = offerNumber || '';
  const dateText = formatNumericDate(data.quoteDate || '');
  const validUntilText = formatNumericDate(data.offerValidUntil || '');

  const drawHeaderCell = (
    segmentIndex: number,
    header: string,
    value: string
  ) => {
    const segXBase = barLeft + segmentWidth * segmentIndex;

    const headerWidth = titleFont.widthOfTextAtSize(header, titleSize);
    const headerX =
      segXBase + (segmentWidth - headerWidth) / 2 + HEADER_X_OFFSET;

    page.drawText(header, {
      x: headerX,
      y: titleY,
      font: titleFont,
      size: titleSize,
      color: WHITE,
    });

    const valueWidth = valueFont.widthOfTextAtSize(value, valueSize);
    const valueX =
      segXBase + (segmentWidth - valueWidth) / 2 + HEADER_X_OFFSET;

    page.drawText(value, {
      x: valueX,
      y: valueY,
      font: valueFont,
      size: valueSize,
      color: WHITE,
    });
  };

  drawHeaderCell(1, 'Offer Number', offerNumberText);
  drawHeaderCell(2, 'Date', dateText);
  drawHeaderCell(3, 'Valid Until', validUntilText || '-');

  // OFFER bar altı
  let y = barBottom - SECTION_GAP - 24;

  // ---------- YARDIMCI ÇİZİM FONKSİYONLARI ----------

  const drawSectionTitle = (title: string) => {
    page.drawText(title, {
      x: contentLeft,
      y,
      font: boldFont,
      size: TITLE_SIZE,
      color: TEXT_COLOR,
    });
    y -= BODY_LINE_HEIGHT + 4;
  };

  const drawSectionDivider = () => {
    page.drawLine({
      start: { x: contentLeft, y },
      end: { x: contentRight, y },
      thickness: 1.2,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= SECTION_GAP;
  };

  const drawBulletListInColumn = (
    items: string[],
    leftX: number,
    rightX: number,
    startY: number
  ) => {
    let yy = startY;
    const font = regularFont;
    const size = BODY_SIZE;

    const bulletX = leftX;
    const textX = leftX + 10;
    const maxWidth = rightX - textX;

    items.forEach((item) => {
      if (!item) return;

      const words = item.split(' ');
      theLines: {
        const lines: string[] = [];
        let current = '';

        words.forEach((word) => {
          const testLine = current ? current + ' ' + word : word;
          const width = font.widthOfTextAtSize(testLine, size);
          if (width > maxWidth && current) {
            lines.push(current);
            current = word;
          } else {
            current = testLine;
          }
        });
        if (current) lines.push(current);

        lines.forEach((line, index) => {
          if (index === 0) {
            page.drawText('•', {
              x: bulletX,
              y: yy,
              font,
              size,
              color: TEXT_COLOR,
            });
          }
          page.drawText(line, {
            x: textX,
            y: yy,
            font,
            size,
            color: TEXT_COLOR,
          });
          yy -= BODY_LINE_HEIGHT;
        });

        yy -= 3;
      }
    });

    return yy;
  };

  const drawBulletListFullWidth = (items: string[]) => {
    y = drawBulletListInColumn(items, contentLeft, contentRight, y);
  };

  const drawTermItem = (
    label: string,
    body: string,
    startY: number
  ): number => {
    const gap = 3;
    const labelSize = TERMS_LABEL_SIZE;
    const bodySize = TERMS_BODY_SIZE;

    const labelWidth = boldFont.widthOfTextAtSize(label, labelSize);
    const maxBodyWidthFirst = contentRight - (contentLeft + labelWidth + gap);
    const maxBodyWidthNext = contentRight - contentLeft;

    const words = body.split(' ');
    const bodyLines: string[] = [];
    let current = '';

    words.forEach((word) => {
      const maxWidth =
        bodyLines.length === 0 ? maxBodyWidthFirst : maxBodyWidthNext;
      const testLine = current ? current + ' ' + word : word;
      const width = regularFont.widthOfTextAtSize(testLine, bodySize);

      if (width > maxWidth && current) {
        bodyLines.push(current);
        current = word;
      } else {
        current = testLine;
      }
    });
    if (current) bodyLines.push(current);

    let yy = startY;

    page.drawText(label, {
      x: contentLeft,
      y: yy,
      font: boldFont,
      size: labelSize,
      color: TEXT_COLOR,
    });

    if (bodyLines.length > 0) {
      page.drawText(bodyLines[0], {
        x: contentLeft + labelWidth + gap,
        y: yy,
        font: regularFont,
        size: bodySize,
        color: SECONDARY_TEXT_COLOR,
      });
    }
    yy -= BODY_LINE_HEIGHT;

    for (let i = 1; i < bodyLines.length; i++) {
      page.drawText(bodyLines[i], {
        x: contentLeft,
        y: yy,
        font: regularFont,
        size: bodySize,
        color: SECONDARY_TEXT_COLOR,
      });
      yy -= BODY_LINE_HEIGHT;
    }

    yy -= 3;
    return yy;
  };

  const measureTermItemHeight = (label: string, body: string): number => {
    const gap = 3;
    const labelSize = TERMS_LABEL_SIZE;
    const bodySize = TERMS_BODY_SIZE;

    const labelWidth = boldFont.widthOfTextAtSize(label, labelSize);
    const maxBodyWidthFirst = contentRight - (contentLeft + labelWidth + gap);
    const maxBodyWidthNext = contentRight - contentLeft;

    const words = body.split(' ');
    const bodyLines: string[] = [];
    let current = '';

    words.forEach((word) => {
      const maxWidth =
        bodyLines.length === 0 ? maxBodyWidthFirst : maxBodyWidthNext;
      const testLine = current ? current + ' ' + word : word;
      const width = regularFont.widthOfTextAtSize(testLine, bodySize);

      if (width > maxWidth && current) {
        bodyLines.push(current);
        current = word;
      } else {
        current = testLine;
      }
    });
    if (current) bodyLines.push(current);

    const lineCount = Math.max(bodyLines.length, 1);
    return lineCount * BODY_LINE_HEIGHT + 3;
  };

  // ---------- TREATMENT + HOSPITAL / SURGEON KARTLARI ----------

  const headerY = y;

  // Sadece Treatment bölümünü hafif yukarı almak için offset
  const TREATMENT_TITLE_OFFSET = 6;
  const treatmentTitleY = headerY + TREATMENT_TITLE_OFFSET;

  // Treatment Plan başlığı – offer şeridinin hemen altına, kartlarla aynı bantta
  page.drawText('Treatment Plan', {
    x: contentLeft,
    y: treatmentTitleY,
    font: boldFont,
    size: TITLE_SIZE,
    color: TEXT_COLOR,
  });

  const hospitalLabel = 'Hospital Name:';
  const surgeonLabel = 'Surgeon’s Name:';

  const headerLabelSize = TERMS_LABEL_SIZE;
  const headerValueSize = TERMS_BODY_SIZE;

  const hospitalLabelWidth = boldFont.widthOfTextAtSize(
    hospitalLabel,
    headerLabelSize
  );
  const hospitalValueWidth = regularFont.widthOfTextAtSize(
    hospitalValue,
    headerValueSize
  );
  const surgeonLabelWidth = boldFont.widthOfTextAtSize(
    surgeonLabel,
    headerLabelSize
  );
  const surgeonValueWidth = regularFont.widthOfTextAtSize(
    surgeonValue,
    headerValueSize
  );

  const lineGap = 6;
  const hospitalLineWidth = hospitalLabelWidth + lineGap + hospitalValueWidth;
  const surgeonLineWidth = surgeonLabelWidth + lineGap + surgeonValueWidth;

  const horizontalPadding = 18;
  const verticalPadding = 8;

  const minContentWidth =
    Math.max(hospitalLineWidth, surgeonLineWidth) + horizontalPadding * 2;

  const MAX_INFO_WIDTH = 260;
  const MIN_INFO_WIDTH = 230;

  const infoWidth = Math.min(
    Math.max(minContentWidth, MIN_INFO_WIDTH),
    MAX_INFO_WIDTH
  );

  const infoX = contentRight - infoWidth;
  const cardHeight = headerLabelSize + verticalPadding * 2 + 4;

  // OFFER ile kartlar arasındaki konum
  const CARDS_OFFSET_FROM_HEADER = BODY_LINE_HEIGHT * 2.8;

  // Üst kart: Hospital
  const hospitalTop = headerY + CARDS_OFFSET_FROM_HEADER;
  const hospitalBottom = hospitalTop - cardHeight;

  page.drawRectangle({
    x: infoX,
    y: hospitalBottom,
    width: infoWidth,
    height: cardHeight,
    color: DARK_BG_COLOR,
  });

  const hospitalTextY =
    hospitalBottom + (cardHeight - headerLabelSize) / 2 + 2;

  const hospitalLabelX = infoX + horizontalPadding;
  const hospitalValueX = hospitalLabelX + hospitalLabelWidth + lineGap;

  page.drawText(hospitalLabel, {
    x: hospitalLabelX,
    y: hospitalTextY,
    font: boldFont,
    size: headerLabelSize,
    color: WHITE,
  });

  page.drawText(hospitalValue, {
    x: hospitalValueX,
    y: hospitalTextY,
    font: regularFont,
    size: headerValueSize,
    color: WHITE,
  });

  // Alt kart: Surgeon
  const gapBetweenCards = 8;
  const surgeonTop = hospitalBottom - gapBetweenCards;
  const surgeonBottom = surgeonTop - cardHeight;

  page.drawRectangle({
    x: infoX,
    y: surgeonBottom,
    width: infoWidth,
    height: cardHeight,
    color: DARK_BG_COLOR,
  });

  const surgeonTextY =
    surgeonBottom + (cardHeight - headerLabelSize) / 2 + 2;

  const surgeonLabelX = infoX + horizontalPadding;
  const surgeonValueX = surgeonLabelX + surgeonLabelWidth + lineGap;

  page.drawText(surgeonLabel, {
    x: surgeonLabelX,
    y: surgeonTextY,
    font: boldFont,
    size: headerLabelSize,
    color: WHITE,
  });

  page.drawText(surgeonValue, {
    x: surgeonValueX,
    y: surgeonTextY,
    font: regularFont,
    size: headerValueSize,
    color: WHITE,
  });

  // Treatment listesi – başlığın hemen altında, başlıkla birlikte yukarı taşındı
  y = treatmentTitleY - BODY_LINE_HEIGHT - 4;

  const surgeryLines: string[] = [];

  if (data.treatments.length === 0) {
    surgeryLines.push('No surgical treatments selected.');
  } else {
    data.treatments.forEach((t) => surgeryLines.push(t.name));
  }

  drawBulletListFullWidth(surgeryLines);

  // Package / Not Included bölümü mutlaka Surgeon kutusunun biraz ALTINDA başlasın
  const minColumnsStartY = surgeonBottom - 12;
  if (y > minColumnsStartY) {
    y = minColumnsStartY;
  }
  y -= 24;

  // ---------- PACKAGE + NOT INCLUDED YAN YANA ----------

  const hotelNights =
    (data.derived as any).totalHotelNights ??
    (data.derived as any).totalNights ??
    0;
  const hospitalNights = (data.derived as any).totalHospitalNights ?? 0;

  let hotelAddOnName: string | null = null;
  let hotelAddOnQty: number | null = null;

  const filteredAddOns: QuoteAddOn[] = (data.addOns || []).filter((a) => {
    const nameLc = a.name
      .toLowerCase()
      .replace(/ı/g, 'i')
      .replace(/\s+/g, ' ')
      .trim();

    if (/(v[iı]p)[\s-]*(transfer)/.test(nameLc)) {
      return false;
    }

    const looksLikeHotel =
      nameLc.includes('lemirage') ||
      nameLc.includes('hotel') ||
      nameLc.includes('otel');

    if (looksLikeHotel && !hotelAddOnName) {
      hotelAddOnName = a.name;
      if (typeof a.quantity === 'number') {
        hotelAddOnQty = a.quantity;
      }
      return false;
    }

    return true;
  });

  let hotelName =
    (data.derived.hotelName && data.derived.hotelName.trim()) || '';

  if (!hotelName && hotelAddOnName) {
    hotelName = hotelAddOnName;
  }
  if (!hotelName) {
    hotelName = 'our partner hotel';
  }

  let accomNights = hotelNights;
  if (hotelAddOnQty && hotelAddOnQty > 0) {
    accomNights = hotelAddOnQty;
  }

  const packageLines: string[] = ['Consultations', 'Internal VIP transfers'];

  if (accomNights && accomNights > 0) {
    const accom = `Accommodation for ${accomNights} night(s) (with breakfast)`;
    packageLines.push(accom);
  }

  if (hospitalNights && hospitalNights > 0) {
    packageLines.push(`Hospital stay for ${hospitalNights} night(s)`);
  }

  packageLines.push(
    'Doctor & anesthesiologist visits',
    'Laboratory Analyzes, BloodWork, Scanning',
    'Anesthesia Fees',
    'Standard medications (antibiotics, pain killers, NSAIDs)',
    'Interpreter service in clinic/hospital during consultations'
  );

  if (filteredAddOns.length > 0) {
    filteredAddOns.forEach((a) => {
      const qty =
        typeof a.quantity === 'number' && a.quantity > 0
          ? ` × ${a.quantity}`
          : '';
      packageLines.push(`${a.name}${qty}`);
    });
  }

  const notIncludedLines: string[] = [
    'Additional tests if required',
    'Additional procedures',
    'Blood transfusion if needed',
    'Additional stay at the hotel',
    'Additional stay at the hospital',
  ];

  const totalAreaGap = 32;
  const columnWidth = (contentRight - contentLeft - totalAreaGap) / 2;
  const leftColLeft = contentLeft;
  const leftColRight = contentLeft + columnWidth;
  const rightColLeft = leftColRight + totalAreaGap;
  const rightColRight = contentRight;

  const columnsTitleY = y;

  let yLeft = columnsTitleY;
  page.drawText('Package Includes', {
    x: leftColLeft,
    y: yLeft,
    font: boldFont,
    size: TITLE_SIZE,
    color: TEXT_COLOR,
  });
  yLeft -= BODY_LINE_HEIGHT + 4;

  let yRight = columnsTitleY;
  page.drawText('Not Included', {
    x: rightColLeft,
    y: yRight,
    font: boldFont,
    size: TITLE_SIZE,
    color: TEXT_COLOR,
  });
  yRight -= BODY_LINE_HEIGHT + 4;

  const yPackagesEnd = drawBulletListInColumn(
    packageLines,
    leftColLeft,
    leftColRight,
    yLeft
  );

  const yNotIncludedEnd = drawBulletListInColumn(
    notIncludedLines,
    rightColLeft,
    rightColRight,
    yRight
  );

  y = Math.min(yPackagesEnd, yNotIncludedEnd) - 4;

  // ŞERİT 2: Package / Not Included altındaki çizgi
  drawSectionDivider();

  // ---------- TOTALS ----------

  const {
    totalAfterDiscountUsd,
    totalAddOnsUsd,
    subtotalUsd,
    vatUsd,
    grandTotalUsd,
    depositUsd,
    balanceUsd,
    multiTreatmentDiscountUsd,
  } = data.derived;

  const safeTreatmentsSubtotal = Number.isFinite(totalAfterDiscountUsd)
    ? totalAfterDiscountUsd
    : 0;
  const safeAddOnsSubtotal = Number.isFinite(totalAddOnsUsd)
    ? totalAddOnsUsd
    : 0;
  const safeSubtotal = Number.isFinite(subtotalUsd)
    ? subtotalUsd
    : safeTreatmentsSubtotal + safeAddOnsSubtotal;
  const safeVat = Number.isFinite(vatUsd) ? vatUsd : 0;
  const safeGrandTotal = Number.isFinite(grandTotalUsd)
    ? grandTotalUsd
    : safeSubtotal + safeVat;
  const safeDeposit =
    Number.isFinite(depositUsd) && grandTotalUsd !== 0
      ? depositUsd
      : (safeGrandTotal * (data.depositPercent || 0)) / 100;
  const safeBalance = Number.isFinite(balanceUsd)
    ? balanceUsd
    : safeGrandTotal - safeDeposit;
  const safeMultiDiscount =
    typeof multiTreatmentDiscountUsd === 'number' &&
    Number.isFinite(multiTreatmentDiscountUsd)
      ? multiTreatmentDiscountUsd
      : 0;

  const depositPercentLabel =
    typeof data.depositPercent === 'number'
      ? `${data.depositPercent}%`
      : '';

  let yy = y - BODY_LINE_HEIGHT;

  const drawTotalLine = (
    label: string,
    value: number,
    options: { bold?: boolean; color?: any } = {}
  ) => {
    const font = options.bold ? boldFont : regularFont;
    const size = BODY_SIZE + 2;
    const color = options.color || TEXT_COLOR;

    page.drawText(label, {
      x: rightColLeft,
      y: yy,
      font,
      size,
      color,
    });

    const valueString = formatCurrency(Math.abs(value), data.currency, true);
    const fullString = value < 0 ? `- ${valueString}` : valueString;
    const textWidth = font.widthOfTextAtSize(fullString, size);

    page.drawText(fullString, {
      x: rightColRight - textWidth,
      y: yy,
      font,
      size,
      color,
    });

    yy -= BODY_LINE_HEIGHT + 2;
  };

  drawTotalLine('Total Payment', safeGrandTotal, { bold: true });

  if (safeMultiDiscount > 0.01) {
    drawTotalLine('Discount Applied', safeMultiDiscount * -1, {
      color: rgb(0.8, 0, 0),
    });
  }

  drawTotalLine(`Deposit Due (${depositPercentLabel})`, safeDeposit, {
    bold: true,
    color: PRIMARY_COLOR,
  });
  drawTotalLine('Remaining After Deposit', safeBalance, { bold: true });

  y = yy - SECTION_GAP;

  // ---------- TERMS & CONDITIONS ----------

  const offerValidUntil =
    data.offerValidUntil || 'the stated validity date';
  const depositDueUntil =
    data.depositDueUntil || 'the stated deposit due date';

  const termsItems: { label: string; body: string }[] = [
    {
      label: 'Demo Quote:',
      body: `This portfolio build uses sample quote settings. Validity date: ${offerValidUntil}.`,
    },
    {
      label: 'Demo Deposit:',
      body: `The ${depositPercentLabel} deposit shown here is an example configuration only. Due date: ${depositDueUntil}.`,
    },
    {
      label: 'Payment Policy:',
      body: 'Production payment policies and commercial terms are intentionally omitted from this public portfolio version.',
    },
    {
      label: 'Privacy:',
      body: 'Use fictional data only when running the public demo. Do not enter real patient, customer or staff information.',
    },
  ];

  const bottomMargin = 40;
  const termsTitleHeight = BODY_LINE_HEIGHT + 4;

  let termsBlockHeight = termsTitleHeight;
  termsItems.forEach((ti) => {
    termsBlockHeight += measureTermItemHeight(ti.label, ti.body);
  });

  const termsStartY = bottomMargin + termsBlockHeight;
  const maxTermsStartY = height - 80;
  const finalTermsStartY = Math.min(termsStartY, maxTermsStartY);

  // Kalın şerit: Terms & Conditions başlığının biraz üstünde
  const termsDividerY = finalTermsStartY + 15;
  page.drawLine({
    start: { x: contentLeft, y: termsDividerY },
    end: { x: contentRight, y: termsDividerY },
    thickness: 1.8,
    color: rgb(0.1, 0.1, 0.1),
  });

  // Başlık şeridin hemen altına gelecek
  y = finalTermsStartY;
  drawSectionTitle('Terms & Conditions');

  termsItems.forEach((ti) => {
    y = drawTermItem(ti.label, ti.body, y);
  });
};

// ============================
// MAIN EXPORT
// ============================

export const generateMultiPagePdf = async (quoteData: QuotePdfData) => {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const [fontBytes, boldFontBytes] = await Promise.all([
    fetch(
      'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf'
    ).then((res) => res.arrayBuffer()),
    fetch(
      'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf'
    ).then((res) => res.arrayBuffer()),
  ]);

  const customFont = await pdfDoc.embedFont(fontBytes);
  const customBoldFont = await pdfDoc.embedFont(boldFontBytes);

  // Dosya adı & Offer Number
  const sanitizedName = sanitizePatientName(quoteData.patientName); // şu an kullanılmıyor ama dursun
  const deptCode = getDepartmentCode(quoteData);
  const serial = getNextSerial();

  // Hasta ismi kaldırıldı -> SRGX_PS_001
  const fileName = `SRGX_${deptCode}_${serial}.pdf`;
  const offerNumberLabel = fileName.replace(/\.pdf$/i, '');

  // PAGE 1 — portfolio-safe generated cover
  const page1 = pdfDoc.addPage(PageSizes.A4);
  const { width: coverWidth, height: coverHeight } = page1.getSize();

  const patientName = quoteData.patientName ?? '';
  const dateIssued = quoteData.quoteDate ?? '';
  const preparedBy = quoteData.preparedBy ?? '';

  page1.drawText('SURGERO', {
    x: 50,
    y: coverHeight - 90,
    font: customBoldFont,
    size: 28,
    color: SURGERO_BLUE_COLOR,
  });

  page1.drawText('Demo Treatment Proposal', {
    x: 50,
    y: coverHeight - 125,
    font: customFont,
    size: 14,
    color: SECONDARY_TEXT_COLOR,
  });

  const coverRows = [
    ['Patient', patientName],
    ['Date Issued', dateIssued],
    ['Prepared By', preparedBy],
  ];

  let coverY = coverHeight - 220;
  coverRows.forEach(([label, value]) => {
    page1.drawText(label, {
      x: 50,
      y: coverY,
      font: customBoldFont,
      size: 10,
      color: SECONDARY_TEXT_COLOR,
    });
    page1.drawText(value || '—', {
      x: 170,
      y: coverY,
      font: customFont,
      size: 11,
      color: TEXT_COLOR,
    });
    coverY -= 34;
  });

  page1.drawText('Portfolio demo — no production customer data or proprietary templates included.', {
    x: 50,
    y: 60,
    font: customFont,
    size: 8,
    color: SECONDARY_TEXT_COLOR,
  });

  // PAGE 2
  const page2 = pdfDoc.addPage(PageSizes.A4);
  await drawQuotePage(
    pdfDoc,
    page2,
    quoteData,
    { regular: customFont, bold: customBoldFont },
    offerNumberLabel
  );

  // Download
  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
};
