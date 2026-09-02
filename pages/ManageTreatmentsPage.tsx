import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import Card from '../components/Card';
import Modal from '../components/Modal';
import { Input, Select } from '../components/Input';
import { Treatment, Department, DEPARTMENTS } from '../types/entities';
import { formatCurrency } from '../utils/helpers';

// --- START: Form Validation and Types ---

interface TreatmentFormValues {
  name: string;
  department: Department;
  basePriceUsd: string;
  minStay: string;
  hospitalStay: string;
  defaultDoctorCode: string;
  combinedDiscount: string;
}

interface TreatmentFormErrors {
  name?: string;
  department?: string;
  basePriceUsd?: string;
  minStay?: string;
  hospitalStay?: string;
  defaultDoctorCode?: string;
  combinedDiscount?: string;
  _warningHighPrice?: string;
  _warningHighDiscount?: string;
  _warningDuplicate?: string;
}

const emptyFormValues: TreatmentFormValues = {
  name: '',
  department: 'Plastic Surgery',
  basePriceUsd: '',
  minStay: '',
  hospitalStay: '',
  defaultDoctorCode: '',
  combinedDiscount: '',
};

const cleanPriceString = (price: string) => price.replace(/[^0-9.]/g, '');

const validateTreatmentForm = (
  values: TreatmentFormValues,
  allTreatments: Treatment[],
  editingId?: string
): TreatmentFormErrors => {
  const errors: TreatmentFormErrors = {};

  if (!values.name.trim()) errors.name = 'Name is required.';
  if (!values.department) errors.department = 'Department is required.';
  if (!values.defaultDoctorCode) errors.defaultDoctorCode = 'Default doctor is required.';

  const isNonInvasive = (values.department || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '') === 'non-invasive';

  const priceNum = Number(cleanPriceString(values.basePriceUsd));
  if (!values.basePriceUsd.trim()) {
    errors.basePriceUsd = 'Base price is required.';
  } else if (isNaN(priceNum) || priceNum <= 0) {
    errors.basePriceUsd = 'Price must be a positive number.';
  } else if (priceNum > 100000) {
    errors._warningHighPrice = 'This price seems unusually high; please double-check.';
  }

  const minStayNum = parseInt(values.minStay, 10);
  const hospitalStayNum = parseInt(values.hospitalStay, 10);

  if (!isNonInvasive) {
    if (!values.minStay.trim()) errors.minStay = 'Min stay is required for this department.';
    if (!values.hospitalStay.trim())
      errors.hospitalStay = 'Hospital stay is required for this department.';
  }

  if (
    values.minStay.trim() &&
    (isNaN(minStayNum) || minStayNum < 0 || minStayNum > 30 || !Number.isInteger(minStayNum))
  ) {
    errors.minStay = 'Must be a whole number between 0 and 30.';
  }
  if (
    values.hospitalStay.trim() &&
    (isNaN(hospitalStayNum) ||
      hospitalStayNum < 0 ||
      hospitalStayNum > 30 ||
      !Number.isInteger(hospitalStayNum))
  ) {
    errors.hospitalStay = 'Must be a whole number between 0 and 30.';
  }

  if (values.combinedDiscount.trim()) {
    const discountNum = Number(values.combinedDiscount);
    if (isNaN(discountNum) || discountNum < 0 || discountNum > 50) {
      errors.combinedDiscount = 'Discount must be between 0 and 50.';
    } else if (discountNum > 30) {
      errors._warningHighDiscount = 'High discount – please confirm this is intended.';
    }
  }

  const duplicate = allTreatments.find(
    t =>
      t.id !== editingId &&
      t.name.trim().toLowerCase() === values.name.trim().toLowerCase() &&
      t.department === values.department &&
      t.defaultDoctorCode === values.defaultDoctorCode
  );
  if (duplicate) {
    errors._warningDuplicate =
      'A treatment with the same name, department, and doctor already exists. Are you sure you want to create another one?';
  }

  return errors;
};

// --- CSV Helper Functions ---

const splitCsvLine = (line: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map(part => part.trim());
};

const parseTreatmentsCsv = (csvText: string): ParsedTreatmentRow[] => {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const header = splitCsvLine(lines[0]).map(h =>
    h
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')
  );
  const rows = lines.slice(1);

  return rows
    .map((rowStr): ParsedTreatmentRow | null => {
      if (!rowStr.trim()) return null;
      const values = splitCsvLine(rowStr);
      const rowData: Record<string, string> = header.reduce((obj, h, i) => {
        obj[h] = values[i]?.trim() || '';
        return obj;
      }, {} as Record<string, string>);

      const name = rowData['name'];
      const department = rowData['department'];
      const basePriceUsdRaw = rowData['basepriceusd'];
      const minStayStr = rowData['minstay'];
      const hospitalStayStr = rowData['hospitalstay'];
      const combinedDiscountStr = rowData['combineddiscount'];
      const defaultDoctorCode = rowData['defaultdoctorcode'];

      if (!name) return { rowData, error: 'Name is required.' };
      if (!department || !DEPARTMENTS.includes(department as Department))
        return { rowData, error: `Invalid department: "${department}".` };

      const basePriceUsd = parseFloat(cleanPriceString(basePriceUsdRaw));
      if (isNaN(basePriceUsd) || basePriceUsd <= 0) {
        return {
          rowData,
          error: `basePriceUsd must be a positive number. Received: "${basePriceUsdRaw || ''}"`,
        };
      }

      const isNonInvasive =
        (department || '').trim().toLowerCase().replace(/\s+/g, '') === 'non-invasive';
      let minStay: number | null = minStayStr ? parseInt(minStayStr, 10) : null;
      let hospitalStay: number | null = hospitalStayStr ? parseInt(hospitalStayStr, 10) : null;

      if (isNonInvasive) {
        if (minStay === null || isNaN(minStay)) minStay = 1;
        if (hospitalStay === null || isNaN(hospitalStay)) hospitalStay = 0;
      }

      if (!isNonInvasive) {
        if (minStay === null || isNaN(minStay))
          return { rowData, error: 'minStay must be a non-negative integer for this department.' };
        if (hospitalStay === null || isNaN(hospitalStay))
          return {
            rowData,
            error: 'hospitalStay must be a non-negative integer for this department.',
          };
      }

      let combinedDiscount: number | undefined = undefined;
      if (combinedDiscountStr && combinedDiscountStr.trim() !== '') {
        const parsedDiscount = parseFloat(combinedDiscountStr);
        if (isNaN(parsedDiscount) || parsedDiscount < 0 || parsedDiscount > 100) {
          return { rowData, error: 'combinedDiscount must be between 0 and 100.' };
        }
        combinedDiscount = parsedDiscount;
      }

      const treatment: Omit<Treatment, 'uid' | 'id'> = {
        name,
        department: department as Department,
        basePriceUsd,
        minStay: minStay!,
        hospitalStay: hospitalStay!,
        defaultDoctorCode: defaultDoctorCode || undefined,
        combinedDiscount,
      };

      return { rowData, treatment };
    })
    .filter((row): row is ParsedTreatmentRow => row !== null);
};

interface ParsedTreatmentRow {
  rowData: Record<string, string>; 
  treatment?: Omit<Treatment, 'uid' | 'id'>; 
  error?: string; 
}

const getDepartmentBadgeStyle = (dept: string) => {
  const d = dept.toLowerCase().replace(/\s+/g, '');
  if (d.includes('plastic')) return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
  if (d.includes('dental')) return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
  if (d.includes('hair')) return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
  if (d.includes('bariatric')) return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
  if (d.includes('non-invasive')) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  return 'bg-slate-700 text-slate-300 border-slate-600';
};

// ------------------------------------------------------------------
// ANA SAYFA BİLEŞENİ
// ------------------------------------------------------------------

const ManageTreatmentsPage: React.FC = () => {
  const {
    treatments,
    addTreatment,
    updateTreatment,
    deleteTreatment,
    deleteMultipleTreatments,
    currentUser,
    doctors,
    showNotification,
  } = useAppContext();

  const userRole = currentUser?.role;
  const isDoctor = userRole === 'Doctor';

  // --- Pagination Config ---
  const ITEMS_PER_PAGE = 20;

  // --- Sorting State ---
  const [sortConfig, setSortConfig] = useState<{ key: 'name' | 'doctor'; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc',
  });

  // --- Pagination State ---
  const [currentPage, setCurrentPage] = useState(1);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTreatment, setEditingTreatment] = useState<Treatment | null>(null);

  const [formValues, setFormValues] = useState<TreatmentFormValues>(emptyFormValues);
  const [formErrors, setFormErrors] = useState<TreatmentFormErrors>({});

  const [searchTerm, setSearchTerm] = useState('');
  const [doctorFilter, setDoctorFilter] = useState<'All' | string>('All');
  const [departmentFilter, setDepartmentFilter] = useState<'All' | string>('All');

  const [hasCombinedDiscount, setHasCombinedDiscount] = useState(false);
  const [isCombinedDiscountConfirmed, setIsCombinedDiscountConfirmed] = useState(false);

  const [parsedCsvData, setParsedCsvData] = useState<ParsedTreatmentRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const masterCheckboxRef = useRef<HTMLInputElement>(null);

  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);

  const canCreateEdit = userRole === 'Admin' || userRole === 'Team';
  const canDelete = userRole === 'Admin';

  const handleSort = (key: 'name' | 'doctor') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, doctorFilter, departmentFilter]);

  useEffect(() => {
    if (isModalOpen) {
      const errors = validateTreatmentForm(formValues, treatments, editingTreatment?.id);
      setFormErrors(errors);
    }
  }, [formValues, isModalOpen, treatments, editingTreatment]);

  // Açılır menü dışına tıklayınca kapat (Global Listener)
  useEffect(() => {
    const handleClickOutside = () => {
      if (openActionMenuId) setOpenActionMenuId(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [openActionMenuId]);

  const filteredAndSortedTreatments = useMemo(() => {
    let result = (treatments || []).filter(
      (t): t is Treatment => !!t && typeof t === 'object' && typeof (t as any).name === 'string'
    );

    if (isDoctor) {
      const doctorCode =
        currentUser?.doctorCode ||
        doctors.find(d => d.name.toLowerCase() === (currentUser?.name || '').toLowerCase())
          ?.code;

      if (doctorCode) {
        result = result.filter(t => t.defaultDoctorCode === doctorCode);
      } else {
        result = [];
      }
    } else {
      if (doctorFilter !== 'All') {
        result = result.filter(
          t => (t.defaultDoctorCode || '').toLowerCase() === doctorFilter.toLowerCase()
        );
      }
    }

    if (departmentFilter !== 'All') {
      result = result.filter(t => t.department === departmentFilter);
    }

    result = result.filter(t =>
      t.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return result.sort((a, b) => {
      let valA = '';
      let valB = '';

      if (sortConfig.key === 'name') {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (sortConfig.key === 'doctor') {
        const docA = doctors.find(d => d.code === a.defaultDoctorCode)?.name || a.defaultDoctorCode || '';
        const docB = doctors.find(d => d.code === b.defaultDoctorCode)?.name || b.defaultDoctorCode || '';
        valA = docA.toLowerCase();
        valB = docB.toLowerCase();
        
        if (valA === valB) {
            return a.name.localeCompare(b.name);
        }
      }

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

  }, [treatments, searchTerm, isDoctor, currentUser, doctors, doctorFilter, departmentFilter, sortConfig]);

  const totalPages = Math.ceil(filteredAndSortedTreatments.length / ITEMS_PER_PAGE);
  const paginatedTreatments = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredAndSortedTreatments.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredAndSortedTreatments, currentPage]);

  const allVisibleIds = useMemo(() => paginatedTreatments.map(t => t.id), [paginatedTreatments]);
  const isAllSelected = useMemo(
    () => allVisibleIds.length > 0 && allVisibleIds.every(id => selectedIds.includes(id)),
    [allVisibleIds, selectedIds]
  );
  const isSomeSelected = useMemo(
    () => selectedIds.length > 0 && !isAllSelected,
    [selectedIds, isAllSelected]
  );

  useEffect(() => {
    if (masterCheckboxRef.current) {
      masterCheckboxRef.current.indeterminate = isSomeSelected;
    }
  }, [isSomeSelected]);

  const handleOpenModal = (treatment: Treatment | null = null) => {
    if (treatment) {
      setEditingTreatment(treatment);
      setFormValues({
        name: treatment.name,
        department: treatment.department,
        basePriceUsd: String(treatment.basePriceUsd),
        minStay: String(treatment.minStay),
        hospitalStay: String(treatment.hospitalStay),
        defaultDoctorCode: treatment.defaultDoctorCode || '',
        combinedDiscount:
          treatment.combinedDiscount != null ? String(treatment.combinedDiscount) : '',
      });
      const hasDiscount = treatment.combinedDiscount != null && treatment.combinedDiscount > 0;
      setHasCombinedDiscount(hasDiscount);
      setIsCombinedDiscountConfirmed(hasDiscount);
    } else {
      setEditingTreatment(null);
      setFormValues(emptyFormValues);
      setHasCombinedDiscount(false);
      setIsCombinedDiscountConfirmed(false);
    }
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleCloseModal = () => setIsModalOpen(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormValues(prev => ({ ...prev, [name]: value }));
  };

  const handleRemoveDiscount = () => {
    setHasCombinedDiscount(false);
    setIsCombinedDiscountConfirmed(false);
    setFormValues(prev => ({ ...prev, combinedDiscount: '' }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalErrors = validateTreatmentForm(formValues, treatments, editingTreatment?.id);
    const errorKeys = Object.keys(finalErrors).filter(k => !k.startsWith('_warning'));

    if (errorKeys.length > 0) {
      setFormErrors(finalErrors);
      showNotification('Please fix the errors before saving.', 'error');
      return;
    }

    let {
      name,
      department,
      defaultDoctorCode,
      combinedDiscount: combinedDiscountStr,
    } = formValues;
    const isNonInvasive = department.trim().toLowerCase().replace(/\s+/g, '') === 'non-invasive';

    let minStayNum = formValues.minStay.trim()
      ? parseInt(formValues.minStay, 10)
      : isNonInvasive
      ? 1
      : 0;
    let hospitalStayNum = formValues.hospitalStay.trim()
      ? parseInt(formValues.hospitalStay, 10)
      : isNonInvasive
      ? 0
      : 0;

    const treatmentToSave: Omit<Treatment, 'uid' | 'id'> = {
      name: name.trim(),
      department,
      basePriceUsd: Number(cleanPriceString(formValues.basePriceUsd)),
      minStay: minStayNum,
      hospitalStay: hospitalStayNum,
      defaultDoctorCode: defaultDoctorCode.trim(),
      combinedDiscount:
        hasCombinedDiscount && combinedDiscountStr ? Number(combinedDiscountStr) : undefined,
    };

    if (editingTreatment) {
      updateTreatment({ ...treatmentToSave, id: editingTreatment.id, uid: editingTreatment.uid });
    } else {
      addTreatment(treatmentToSave);
    }
    handleCloseModal();
  };

  const handleToggleAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(prev => [...new Set([...prev, ...allVisibleIds])]);
    } else {
      setSelectedIds(prev => prev.filter(id => !allVisibleIds.includes(id)));
    }
  };

  const handleToggleOne = (id: string, isChecked: boolean) => {
    if (isChecked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
    }
  };

  const handleDeleteSelected = () => {
    if (!selectedIds.length) return;
    deleteMultipleTreatments(selectedIds);
    setSelectedIds([]);
  };

  const handleRowDelete = (id: string) => {
    const found = treatments.find(t => t.id === id || t.uid === id);
    if (!found) return;
    deleteTreatment(id);
  };

  const handleCsvFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setParsedCsvData([]);
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      if (text) setParsedCsvData(parseTreatmentsCsv(text));
    };
    reader.readAsText(file);
  };

  const validRowsToImport = useMemo(
    () => parsedCsvData.filter(row => !!row.treatment),
    [parsedCsvData]
  );

  const handleConfirmImport = () => {
    if (validRowsToImport.length === 0) return;
    validRowsToImport.forEach(row => {
      if (row.treatment) addTreatment(row.treatment);
    });
    showNotification(`Imported ${validRowsToImport.length} treatments.`, 'success');
    setParsedCsvData([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ✅ YENİ: Template (Şablon) İndirme Fonksiyonu
  const handleDownloadTemplate = () => {
    const headers = [
      'name',
      'department',
      'basePriceUsd',
      'minStay',
      'hospitalStay',
      'combinedDiscount',
      'defaultDoctorCode'
    ];

    const exampleRow = [
      'Example Rhinoplasty', // name
      'Plastic Surgery',     // department
      '3500',                // basePriceUsd
      '7',                   // minStay
      '1',                   // hospitalStay
      '0',                   // combinedDiscount
      'DR_AA'                // defaultDoctorCode
    ];

    const csvContent = '\ufeff' + [headers.join(','), exampleRow.join(',')].join('\n');

    const encodedUri = encodeURI('data:text/csv;charset=utf-8,' + csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'surgero_treatments_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ✅ YENİ: Mevcut Verileri Dışarı Aktarma (Export) Fonksiyonu
  const handleExportData = () => {
    if (!treatments || treatments.length === 0) {
      showNotification('No data to export.', 'error');
      return;
    }

    const headers = [
      'name',
      'department',
      'basePriceUsd',
      'minStay',
      'hospitalStay',
      'combinedDiscount',
      'defaultDoctorCode'
    ];

    const rows = treatments.map(t => [
      `"${t.name}"`, // Virgül içeren isimleri korumak için tırnak içine al
      t.department,
      t.basePriceUsd,
      t.minStay,
      t.hospitalStay,
      t.combinedDiscount || 0,
      t.defaultDoctorCode || ''
    ].join(','));

    // \ufeff: Türkçe karakter desteği için
    const csvContent = '\ufeff' + [headers.join(','), ...rows].join('\n');

    const encodedUri = encodeURI('data:text/csv;charset=utf-8,' + csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `surgero_all_treatments_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const SortIcon = ({ column }: { column: 'name' | 'doctor' }) => {
    if (sortConfig.key !== column) return <span className="ml-1 opacity-20 text-[10px]">↕</span>;
    return <span className="ml-1 text-teal-400">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
  };

  // ✅ YENİ: İsimden Baş Harfleri Alma Helper'ı
  const getInitials = (name: string) => {
    if (!name) return '??';
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().substring(0, 2);
  };

  const isSaveDisabled =
    Object.keys(formErrors).some(k => !k.startsWith('_warning')) ||
    (hasCombinedDiscount && !isCombinedDiscountConfirmed);

  return (
    <div className="w-full">
      <Card title="Manage Treatments">
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="flex-1">
            <Input
              label="Search by Name"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="e.g. Rhinoplasty"
            />
          </div>
          <div className="w-full sm:w-48">
            <Select
              label="Filter by Dept"
              value={departmentFilter}
              onChange={e => setDepartmentFilter(e.target.value)}
            >
              <option value="All">All Departments</option>
              {DEPARTMENTS.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </Select>
          </div>
          {!isDoctor && (
            <div className="w-full sm:w-64">
              <Select
                label="Filter by Doctor"
                value={doctorFilter}
                onChange={e => setDoctorFilter(e.target.value as 'All' | string)}
              >
                <option value="All">All Doctors</option>
                {doctors
                  .filter(d => d.isActive)
                  .map(d => (
                    <option key={d.uid} value={d.code}>
                      Dr. {d.name} ({d.code})
                    </option>
                  ))}
              </Select>
            </div>
          )}
          <div className="self-end">
            {canCreateEdit && (
              <button
                onClick={() => handleOpenModal()}
                className="w-full sm:w-auto bg-teal-600 text-white py-2 px-4 rounded-md hover:bg-teal-700"
              >
                Add New Treatment
              </button>
            )}
          </div>
        </div>

        {canDelete && selectedIds.length > 0 && (
          <div className="bg-slate-700/50 p-2 rounded-md mb-4 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-300">
              {selectedIds.length} treatment(s) selected
            </span>
            <button
              onClick={handleDeleteSelected}
              className="px-3 py-1 bg-red-600 text-white text-xs font-semibold rounded-md hover:bg-red-700 transition-colors"
            >
              Delete Selected
            </button>
          </div>
        )}

        <div className="overflow-visible rounded-lg border border-slate-700 bg-slate-800/50">
          <table className="min-w-full w-full divide-y divide-slate-700">
            <thead className="bg-slate-700/50">
              <tr>
                {canDelete && (
                  <th scope="col" className="px-6 py-3 w-10">
                    <input
                      type="checkbox"
                      ref={masterCheckboxRef}
                      checked={isAllSelected}
                      onChange={handleToggleAll}
                      className="h-4 w-4 rounded border-slate-500 bg-slate-600 text-teal-600 focus:ring-teal-500"
                    />
                  </th>
                )}
                
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-teal-400 select-none"
                  onClick={() => handleSort('name')}
                >
                  Name <SortIcon column="name" />
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Department</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Base Price (USD)</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Min Stay</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Hosp. Stay</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Discount %</th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-teal-400 select-none"
                  onClick={() => handleSort('doctor')}
                >
                  Default Doctor <SortIcon column="doctor" />
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-slate-800 divide-y divide-slate-700">
              {paginatedTreatments.map(t => {
                const doctor = doctors.find(d => d.code === t.defaultDoctorCode);
                const doctorName = doctor?.name || '-';
                const doctorImage = doctor?.imageUrl;

                return (
                <tr key={t.id} className={selectedIds.includes(t.id) ? 'bg-slate-700' : 'hover:bg-slate-700/20 transition-colors'}>
                  {canDelete && (
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(t.id)}
                        onChange={e => handleToggleOne(t.id, e.target.checked)}
                        className="h-4 w-4 rounded border-slate-500 bg-slate-600 text-teal-600 focus:ring-teal-500"
                      />
                    </td>
                  )}
                  <td className="px-6 py-4 text-sm font-medium text-slate-100">{t.name}</td>
                  <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full uppercase tracking-wider border ${getDepartmentBadgeStyle(t.department)}`}>
                          {t.department}
                      </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-bold text-teal-400">
                    {typeof t.basePriceUsd === 'number'
                      ? `$${t.basePriceUsd.toFixed(2)}`
                      : t.basePriceUsd
                      ? `$${Number(t.basePriceUsd).toFixed(2)}`
                      : '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{t.minStay ?? '—'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{t.hospitalStay ?? '—'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{t.combinedDiscount ?? 0}%</td>
                  <td className="px-6 py-4">
                    {/* ✅ YENİ: DOKTOR AVATARI + İSİM */}
                    <div className="flex items-center gap-3">
                        <div className="flex-shrink-0">
                            {doctorImage ? (
                                <img src={doctorImage} alt={doctorName} className="w-8 h-8 rounded-full object-cover border border-slate-600 shadow-sm" />
                            ) : (
                                <div className="w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-xs font-bold text-slate-400">
                                    {getInitials(doctorName)}
                                </div>
                            )}
                        </div>
                        <div>
                            <div className="text-sm font-medium text-slate-200">{doctorName}</div>
                            <div className="text-[10px] text-slate-500 font-mono tracking-wide">{t.defaultDoctorCode}</div>
                        </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium relative">
                    {canCreateEdit || canDelete ? (
                      <>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            setOpenActionMenuId(openActionMenuId === t.id ? null : t.id);
                          }}
                          className="p-2 rounded-full hover:bg-slate-700 focus:outline-none"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-5 w-5 text-slate-400 hover:text-white"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                          </svg>
                        </button>
                        
                        {openActionMenuId === t.id && (
                          <div className="absolute right-10 top-0 mt-2 w-32 rounded-md border border-slate-600 bg-slate-800 shadow-2xl z-50">
                            {canCreateEdit && (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenActionMenuId(null);
                                  handleOpenModal(t);
                                }}
                                className="block w-full text-left px-4 py-3 text-sm text-slate-200 hover:bg-slate-700 border-b border-slate-700/50"
                              >
                                Edit
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenActionMenuId(null);
                                  handleRowDelete(t.id);
                                }}
                                className="block w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-slate-700"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-slate-500">Read-only</span>
                    )}
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>

        {/* PAGINATION CONTROLS */}
        {filteredAndSortedTreatments.length > 0 && (
          <div className="flex items-center justify-between mt-4 border-t border-slate-700 pt-4">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 rounded-md hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <div className="text-sm text-slate-400">
              Page <span className="font-semibold text-white">{currentPage}</span> of <span className="font-semibold text-white">{totalPages}</span>
            </div>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 rounded-md hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}

        <Modal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          title={editingTreatment ? 'Edit Treatment' : 'Add New Treatment'}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input label="Name" name="name" value={formValues.name} onChange={handleChange} />
              {formErrors.name && (
                <p className="mt-1 text-xs text-red-400">{formErrors.name}</p>
              )}
            </div>
            <div>
              <Select
                label="Department"
                name="department"
                value={formValues.department}
                onChange={handleChange}
              >
                {DEPARTMENTS.map(d => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
              {formErrors.department && (
                <p className="mt-1 text-xs text-red-400">{formErrors.department}</p>
              )}
            </div>
            <div>
              <Input
                label="Base Price (USD)"
                name="basePriceUsd"
                value={formValues.basePriceUsd}
                onChange={handleChange}
                placeholder="e.g. 2500.00"
              />
              {formErrors.basePriceUsd && (
                <p className="mt-1 text-xs text-red-400">{formErrors.basePriceUsd}</p>
              )}
              {!formErrors.basePriceUsd && formErrors._warningHighPrice && (
                <p className="mt-1 text-xs text-amber-400">{formErrors._warningHighPrice}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Input
                  label="Min Stay (Nights)"
                  name="minStay"
                  value={formValues.minStay}
                  onChange={handleChange}
                />
                {formErrors.minStay && (
                  <p className="mt-1 text-xs text-red-400">{formErrors.minStay}</p>
                )}
              </div>
              <div>
                <Input
                  label="Hospital Stay (Nights)"
                  name="hospitalStay"
                  value={formValues.hospitalStay}
                  onChange={handleChange}
                />
                {formErrors.hospitalStay && (
                  <p className="mt-1 text-xs text-red-400">{formErrors.hospitalStay}</p>
                )}
              </div>
            </div>

            {!hasCombinedDiscount ? (
              <button
                type="button"
                onClick={() => {
                  setHasCombinedDiscount(true);
                  setIsCombinedDiscountConfirmed(false);
                }}
                className="w-full text-left px-3 py-2 border border-dashed border-slate-600 text-slate-300 rounded-md hover:bg-slate-700/50 transition-colors"
              >
                + Add Combined Discount (optional)
              </button>
            ) : (
              <div className="p-4 bg-slate-700/50 rounded-md space-y-3 border border-slate-600">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-grow">
                    <Input
                      label="Combined Discount %"
                      name="combinedDiscount"
                      value={formValues.combinedDiscount}
                      onChange={handleChange}
                    />
                    {formErrors.combinedDiscount && (
                      <p className="mt-1 text-xs text-red-400">{formErrors.combinedDiscount}</p>
                    )}
                    {!formErrors.combinedDiscount && formErrors._warningHighDiscount && (
                      <p className="mt-1 text-xs text-amber-400">
                        {formErrors._warningHighDiscount}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveDiscount}
                    className="mt-7 text-sm text-red-500 hover:text-red-400 font-medium whitespace-nowrap"
                  >
                    Remove
                  </button>
                </div>
                <div className="flex items-start">
                  <input
                    type="checkbox"
                    id="confirmDiscount"
                    checked={isCombinedDiscountConfirmed}
                    onChange={e => setIsCombinedDiscountConfirmed(e.target.checked)}
                    className="h-4 w-4 mt-1 rounded border-slate-500 bg-slate-600 text-teal-600 focus:ring-teal-500"
                  />
                  <label htmlFor="confirmDiscount" className="ml-3 block text-sm text-slate-300">
                    I confirm this combined discount is correct for this treatment.
                  </label>
                </div>
              </div>
            )}

            <div>
              <Select
                label="Default Doctor"
                name="defaultDoctorCode"
                value={formValues.defaultDoctorCode}
                onChange={handleChange}
              >
                <option value="">-- Select a default doctor --</option>
                {doctors
                  .filter(d => d.isActive)
                  .map(d => (
                    <option key={d.uid} value={d.code}>
                      Dr. {d.name}
                    </option>
                  ))}
              </Select>
              {formErrors.defaultDoctorCode && (
                <p className="mt-1 text-xs text-red-400">{formErrors.defaultDoctorCode}</p>
              )}
            </div>

            {formErrors._warningDuplicate && (
              <p className="mt-2 text-xs text-amber-400">{formErrors._warningDuplicate}</p>
            )}

            <div className="pt-4 flex justify-end space-x-2">
              <button
                type="button"
                onClick={handleCloseModal}
                className="px-4 py-2 bg-slate-600 text-slate-200 rounded-md hover:bg-slate-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaveDisabled}
                className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:bg-slate-500 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                {editingTreatment ? 'Save Changes' : 'Add Treatment'}
              </button>
            </div>
          </form>
        </Modal>
      </Card>

      {canCreateEdit && (
        <Card title="Bulk Data Operations" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* SOL TARAF: IMPORT & TEMPLATE */}
            <div className="space-y-4">
                <h4 className="text-sm font-semibold text-slate-200 uppercase tracking-wider border-b border-slate-700 pb-2">1. Import Treatments</h4>
                <p className="text-sm text-slate-400">
                    Upload a CSV file to add multiple treatments at once. Please use the official template to avoid errors.
                </p>
                
                <button 
                    onClick={handleDownloadTemplate}
                    className="flex items-center gap-2 text-teal-400 hover:text-teal-300 text-sm font-medium transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Download CSV Template
                </button>

                <div className="flex items-center gap-4 pt-2">
                    <input type="file" accept=".csv" ref={fileInputRef} onChange={handleCsvFileChange} className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-slate-700 file:text-teal-400 hover:file:bg-slate-600 cursor-pointer" />
                </div>

                {parsedCsvData.length > 0 && (
                    <div className="mt-4">
                        <h5 className="text-xs font-semibold text-slate-400 uppercase mb-2">Preview</h5>
                        <div className="max-h-60 overflow-y-auto border border-slate-700 rounded-md mb-4 bg-slate-800/50">
                            <table className="min-w-full text-xs">
                                <thead className="bg-slate-700/50 sticky top-0">
                                    <tr>
                                        <th className="p-2 text-left text-slate-300 font-medium">Name</th>
                                        <th className="p-2 text-left text-slate-300 font-medium">Dept</th>
                                        <th className="p-2 text-left text-slate-300 font-medium">Price</th>
                                        <th className="p-2 text-left text-slate-300 font-medium">Stays</th>
                                        <th className="p-2 text-left text-slate-300 font-medium">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-700">
                                    {parsedCsvData.map((row, i) => {
                                        const isError = !!row.error;
                                        const t = row.treatment;
                                        const raw = row.rowData;
                                        return (
                                            <tr key={i} className={isError ? 'bg-red-500/10' : ''}>
                                                <td className="p-2 text-slate-200">{t?.name || raw.name}</td>
                                                <td className="p-2 text-slate-400">{t?.department || raw.department}</td>
                                                <td className="p-2 text-teal-400 font-mono">
                                                    {typeof t?.basePriceUsd === 'number' ? `$${t.basePriceUsd}` : raw.basepriceusd}
                                                </td>
                                                <td className="p-2 text-slate-400">
                                                    {t ? `${t.minStay}/${t.hospitalStay}` : `${raw.minstay}/${raw.hospitalstay}`}
                                                </td>
                                                <td className="p-2">
                                                    {isError ? (
                                                        <span className="text-red-400 font-bold" title={row.error}>Error</span>
                                                    ) : (
                                                        <span className="text-emerald-400 font-bold">Valid</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <button 
                            onClick={handleConfirmImport} 
                            disabled={validRowsToImport.length === 0} 
                            className="w-full bg-teal-600 text-white py-2 px-4 rounded-md hover:bg-teal-700 font-bold disabled:bg-slate-600 disabled:cursor-not-allowed shadow-lg"
                        >
                            Import {validRowsToImport.length} Treatments
                        </button>
                    </div>
                )}
            </div>

            {/* SAĞ TARAF: EXPORT CURRENT DATA */}
            <div className="space-y-4 border-l border-slate-700 md:pl-8">
                <h4 className="text-sm font-semibold text-slate-200 uppercase tracking-wider border-b border-slate-700 pb-2">2. Export Data</h4>
                <p className="text-sm text-slate-400">
                    Download all existing treatments currently in the system as a CSV file. Useful for backups or bulk editing in Excel.
                </p>
                <div className="pt-2">
                    <button 
                        onClick={handleExportData}
                        className="flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-md transition-all font-medium border border-slate-600 hover:border-slate-500 shadow-sm"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                        Export All Treatments to CSV
                    </button>
                </div>
            </div>

          </div>
        </Card>
      )}
    </div>
  );
};

export default ManageTreatmentsPage;