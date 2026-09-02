import React, { useMemo, useState, useEffect, useRef } from 'react';
import Card from '../components/Card';
import Modal from '../components/Modal';
import { Input, Select } from '../components/Input';
import { useAppContext } from '../context/AppContext';
import { AddOn, UserRole } from '../types/entities';
import { formatCurrency } from '../utils/helpers';

interface AddOnFormValues {
  name: string;
  category: string;
  priceType: string;
  basePriceUsd: string;
}

interface AddOnFormErrors {
  name?: string;
  category?: string;
  priceType?: string;
  basePriceUsd?: string;
  _warningHighPrice?: string;
}

const CATEGORY_OPTIONS = [
  'Accommodation',
  'Transportation',
  'Extra Services',
  'Hospital',
  'Other',
];

const PRICE_TYPE_OPTIONS = ['per night', 'per product', 'per day', 'per person'];

const emptyFormValues: AddOnFormValues = {
  name: '',
  category: '',
  priceType: '',
  basePriceUsd: '',
};

const cleanPriceString = (price: string) => price.replace(/[^0-9.]/g, '');

const validateAddOnForm = (values: AddOnFormValues): AddOnFormErrors => {
  const errors: AddOnFormErrors = {};
  if (!values.name.trim()) errors.name = 'Name is required.';
  if (!values.category.trim()) errors.category = 'Category is required.';
  if (!values.priceType.trim()) errors.priceType = 'Price type is required.';

  const priceNum = Number(cleanPriceString(values.basePriceUsd));
  if (!values.basePriceUsd.trim()) {
    errors.basePriceUsd = 'Base price is required.';
  } else if (isNaN(priceNum) || priceNum < 0) {
    errors.basePriceUsd = 'Price must be a valid number.';
  } else if (priceNum > 5000) {
    errors._warningHighPrice = 'This price seems unusually high; please double-check.';
  }
  return errors;
};

const getCategoryBadgeStyle = (category: string) => {
  const c = category.toLowerCase();
  if (c.includes('accommodation')) return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
  if (c.includes('transportation')) return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
  if (c.includes('hospital')) return 'bg-red-500/10 text-red-400 border-red-500/20';
  if (c.includes('extra')) return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
  return 'bg-slate-700 text-slate-300 border-slate-600';
};

const AddOnsPage: React.FC = () => {
  const { 
    addOns, addAddOn, updateAddOn, deleteAddOn, 
    currentUser, showNotification, 
    hospitals, addHospital, deleteHospital 
  } = useAppContext();

  const userRole: UserRole | undefined = currentUser?.role;
  const canCreateEdit = userRole === 'Admin' || userRole === 'Team';
  const canDelete = userRole === 'Admin';

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [sortConfig, setSortConfig] = useState<{ key: 'name' | 'category' | 'price'; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc',
  });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const masterCheckboxRef = useRef<HTMLInputElement>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAddOn, setEditingAddOn] = useState<AddOn | null>(null);
  const [formValues, setFormValues] = useState<AddOnFormValues>(emptyFormValues);
  const [formErrors, setFormErrors] = useState<AddOnFormErrors>({});

  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);

  // Hastane Ekleme State'i
  const [newHospitalName, setNewHospitalName] = useState('');

  // DEBUG: Verilerin nasıl geldiğini konsolda görmek için
  useEffect(() => {
    console.log("Mevcut Add-ons Listesi:", addOns);
    console.log("Mevcut Hospitals Listesi:", hospitals);
  }, [addOns, hospitals]);

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    addOns.forEach(a => { if (a.category) set.add(a.category); });
    CATEGORY_OPTIONS.forEach(c => set.add(c));
    return Array.from(set).sort();
  }, [addOns]);

  const filteredAndSortedAddOns = useMemo(() => {
    let result = (addOns || []).filter(a => {
      const matchesSearch = a.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = categoryFilter === 'All' ? true : a.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });

    return result.sort((a, b) => {
      let valA: string | number = '';
      let valB: string | number = '';

      if (sortConfig.key === 'name') {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (sortConfig.key === 'category') {
        valA = a.category.toLowerCase();
        valB = b.category.toLowerCase();
      } else if (sortConfig.key === 'price') {
        valA = Number(a.basePriceUsd);
        valB = Number(b.basePriceUsd);
      }

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [addOns, searchTerm, categoryFilter, sortConfig]);

  // Add-ons için 'uid' kullanıyoruz (Screenshotta göründüğü üzere)
  const allVisibleIds = useMemo(() => filteredAndSortedAddOns.map(a => a.uid), [filteredAndSortedAddOns]);
  const isAllSelected = useMemo(() => allVisibleIds.length > 0 && allVisibleIds.every(id => selectedIds.includes(id)), [allVisibleIds, selectedIds]);
  const isSomeSelected = useMemo(() => selectedIds.length > 0 && !isAllSelected, [selectedIds, isAllSelected]);

  useEffect(() => {
    if (masterCheckboxRef.current) masterCheckboxRef.current.indeterminate = isSomeSelected;
  }, [isSomeSelected]);

  useEffect(() => {
    if (isModalOpen) {
      const errs = validateAddOnForm(formValues);
      setFormErrors(errs);
    }
  }, [formValues, isModalOpen]);

  useEffect(() => {
    const handleClickOutside = () => { if (openActionMenuId) setOpenActionMenuId(null); };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [openActionMenuId]);

  const handleSort = (key: 'name' | 'category' | 'price') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const handleToggleAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelectedIds(prev => [...new Set([...prev, ...allVisibleIds])]);
    else setSelectedIds(prev => prev.filter(id => !allVisibleIds.includes(id)));
  };

  const handleToggleOne = (id: string, isChecked: boolean) => {
    if (isChecked) setSelectedIds(prev => [...prev, id]);
    else setSelectedIds(prev => prev.filter(sid => sid !== id));
  };

  const handleDeleteSelected = () => {
    if (!canDelete || !selectedIds.length) return;
    
    selectedIds.forEach(id => {
        if (id) deleteAddOn(id);
    });
    setSelectedIds([]);
    showNotification(`${selectedIds.length} add-ons deleted.`, 'success');
  };

  // ADD-ON SİLME (Düzeltildi: uid kullanıyor)
  const handleRowDelete = (uid: string) => {
    if (!canDelete) return;
    
    // Screenshot'ta alan adı 'uid' olduğu için onu kullanıyoruz.
    if (!uid) {
        console.error("Delete Error: UID is missing for this add-on.");
        // Kullanıcıya da gösterelim
        showNotification("Error: Cannot delete item without UID.", 'error');
        return; 
    }
    
    console.log("Deleting AddOn with UID:", uid);
    deleteAddOn(uid);
  };

  // HASTANE SİLME (Düzeltildi: id veya uid kontrolü)
  const handleDeleteHospital = (hospitalObj: any) => {
    if (!canDelete) return;

    // Hospital verisinde ID'nin hangi alanda olduğunu bulmaya çalışıyoruz
    // Genellikle Firebase listelerinde 'id' olur, ama veri içinde 'uid' de olabilir.
    const hospitalId = hospitalObj.id || hospitalObj.uid || hospitalObj.key;

    if (!hospitalId) {
        console.error("Delete Error: Hospital ID is missing. Object:", hospitalObj);
        showNotification("Error: Could not find hospital ID to delete. Check console.", 'error');
        return;
    }

    console.log("Deleting Hospital with ID:", hospitalId);
    deleteHospital(hospitalId); 
  };

  const handleOpenModal = (addOn: AddOn | null = null) => {
    if (addOn) {
      setEditingAddOn(addOn);
      setFormValues({
        name: addOn.name || '',
        category: addOn.category || '',
        priceType: addOn.priceType || '',
        basePriceUsd: typeof addOn.basePriceUsd === 'number' ? String(addOn.basePriceUsd) : (addOn.basePriceUsd as any as string) || '',
      });
    } else {
      setEditingAddOn(null);
      setFormValues(emptyFormValues);
    }
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleCloseModal = () => setIsModalOpen(false);

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormValues(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalErrors = validateAddOnForm(formValues);
    if (Object.keys(finalErrors).some(k => !k.startsWith('_warning'))) {
      setFormErrors(finalErrors);
      showNotification('Please fix the errors before saving.', 'error');
      return;
    }

    const payload = {
      name: formValues.name.trim(),
      category: formValues.category.trim(),
      priceType: formValues.priceType.trim(),
      basePriceUsd: Number(cleanPriceString(formValues.basePriceUsd)),
    };

    if (editingAddOn) {
      updateAddOn({ ...editingAddOn, ...payload });
    } else {
      addAddOn(payload);
    }
    setIsModalOpen(false);
  };

  const handleAddHospital = () => {
    if (!newHospitalName.trim()) return;
    addHospital(newHospitalName.trim());
    setNewHospitalName('');
  };

  const SortIcon = ({ column }: { column: 'name' | 'category' | 'price' }) => {
    if (sortConfig.key !== column) return <span className="ml-1 opacity-20 text-[10px]">↕</span>;
    return <span className="ml-1 text-teal-400">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
  };

  const isSaveDisabled = Object.keys(formErrors).some(k => !k.startsWith('_warning'));

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
        {/* SOL TARAF: MEVCUT ADD-ONS TABLOSU */}
        <div className="lg:col-span-2">
            <Card title="Manage Add-ons">
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="flex-1">
                    <Input label="Search by Name" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="e.g. VIP Transfer" />
                </div>
                <div className="w-full sm:w-64">
                    <Select label="Filter by Category" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                        <option value="All">All Categories</option>
                        {availableCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </Select>
                </div>
                <div className="self-end">
                    {canCreateEdit && (
                    <button onClick={() => handleOpenModal()} className="w-full sm:w-auto bg-teal-600 text-white py-2 px-6 rounded-md hover:bg-teal-700 shadow-lg shadow-teal-900/20 transition-all font-medium">+ Add New</button>
                    )}
                </div>
                </div>

                {canDelete && selectedIds.length > 0 && (
                <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-md mb-4 flex items-center justify-between">
                    <span className="text-sm font-medium text-red-400">{selectedIds.length} items selected</span>
                    <button onClick={handleDeleteSelected} className="px-4 py-1.5 bg-red-600 text-white text-xs font-bold rounded-md hover:bg-red-700 shadow-sm transition-all uppercase tracking-wider">
                      Delete Selected
                    </button>
                </div>
                )}

                <div className="overflow-visible rounded-lg border border-slate-700 bg-slate-800/50">
                <table className="min-w-full w-full divide-y divide-slate-700">
                    <thead className="bg-slate-700/30">
                    <tr>
                        {canDelete && (
                        <th scope="col" className="px-6 py-3 w-10">
                            <input type="checkbox" ref={masterCheckboxRef} checked={isAllSelected} onChange={handleToggleAll} className="h-4 w-4 rounded border-slate-500 bg-slate-600 text-teal-600 focus:ring-teal-500" />
                        </th>
                        )}
                        <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-teal-400 select-none" onClick={() => handleSort('name')}>Name <SortIcon column="name" /></th>
                        <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-teal-400 select-none" onClick={() => handleSort('category')}>Category <SortIcon column="category" /></th>
                        <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Price Type</th>
                        <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-teal-400 select-none" onClick={() => handleSort('price')}>Base Price <SortIcon column="price" /></th>
                        <th scope="col" className="px-6 py-4 text-right text-xs font-bold text-slate-400 uppercase tracking-widest">Actions</th>
                    </tr>
                    </thead>
                    <tbody className="bg-slate-800 divide-y divide-slate-700">
                    {filteredAndSortedAddOns.map(addOn => (
                        // BURADA addOn.uid KULLANIYORUZ
                        <tr key={addOn.uid} className={`${selectedIds.includes(addOn.uid) ? 'bg-teal-500/5' : 'hover:bg-slate-700/20'} transition-colors`}>
                        {canDelete && (
                            <td className="px-6 py-4">
                            {/* Checkbox için de uid kullanıyoruz */}
                            <input type="checkbox" checked={selectedIds.includes(addOn.uid)} onChange={e => handleToggleOne(addOn.uid, e.target.checked)} className="h-4 w-4 rounded border-slate-500 bg-slate-600 text-teal-600 focus:ring-teal-500" />
                            </td>
                        )}
                        <td className="px-6 py-4 text-sm font-medium text-slate-100">{addOn.name}</td>
                        <td className="px-6 py-4"><span className={`px-2.5 py-1 text-[10px] font-bold rounded-full uppercase tracking-wider border ${getCategoryBadgeStyle(addOn.category)}`}>{addOn.category || '—'}</span></td>
                        <td className="px-6 py-4 text-sm text-slate-400 capitalize">{addOn.priceType || '—'}</td>
                        <td className="px-6 py-4 text-sm font-mono font-bold text-teal-400 whitespace-nowrap">{formatCurrency(Number(addOn.basePriceUsd), 'USD')}</td>
                        <td className="px-6 py-4 text-right text-sm font-medium relative">
                            {canCreateEdit || canDelete ? (
                            <div className="flex justify-end gap-2">
                                {canCreateEdit && (
                                    <button onClick={() => handleOpenModal(addOn)} className="p-1.5 text-slate-400 hover:text-teal-400 hover:bg-slate-700 rounded transition-all" title="Edit">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                    </button>
                                )}
                                {canDelete && (
                                    // SİLME İŞLEMİ: addOn.uid gönderiyoruz
                                    <button onClick={() => handleRowDelete(addOn.uid)} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-all" title="Delete">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                )}
                            </div>
                            ) : (
                            <span className="text-slate-500 text-xs">Locked</span>
                            )}
                        </td>
                        </tr>
                    ))}
                    {filteredAndSortedAddOns.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-slate-500 italic">No add-ons found.</td></tr>}
                    </tbody>
                </table>
                </div>
            </Card>
        </div>

        {/* SAĞ TARAF: MANAGE HOSPITALS */}
        <div className="lg:col-span-1">
            <Card title="Manage Hospitals">
                <p className="text-sm text-slate-400 mb-4">Add hospitals to be displayed in the PDF generation dropdown.</p>
                
                {canCreateEdit && (
                    <div className="flex gap-2 mb-6">
                        <input 
                            type="text" 
                            className="flex-1 bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-200 focus:ring-teal-500 focus:border-teal-500"
                            placeholder="Hospital Name..."
                            value={newHospitalName}
                            onChange={(e) => setNewHospitalName(e.target.value)}
                        />
                        <button 
                            onClick={handleAddHospital}
                            disabled={!newHospitalName.trim()}
                            className="bg-teal-600 hover:bg-teal-500 text-white px-3 py-2 rounded-md font-bold text-sm disabled:opacity-50 transition-colors"
                        >
                            Add
                        </button>
                    </div>
                )}

                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                    {hospitals && hospitals.length > 0 ? (
                        hospitals.map((h: any, index: number) => (
                            // Hastane listesi map edilirken key olarak id/uid kullanmaya çalışıyoruz
                            <div key={h.id || h.uid || index} className="flex justify-between items-center bg-slate-800/50 p-3 rounded-md border border-slate-700/50 group hover:border-slate-600 transition-colors">
                                <span className="text-sm text-slate-200 font-medium">{h.name}</span>
                                {canDelete && (
                                    <button 
                                        // Tüm objeyi gönderiyoruz ki fonksiyon içinde ID'yi arasın
                                        onClick={() => handleDeleteHospital(h)}
                                        className="text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                        title="Remove"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                )}
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-8 border border-dashed border-slate-700 rounded-lg">
                            <p className="text-slate-500 text-sm">No hospitals added yet.</p>
                        </div>
                    )}
                </div>
            </Card>
        </div>

      </div>

      <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={editingAddOn ? 'Edit Add-on' : 'Add New Add-on'}>
        <form onSubmit={handleSubmit} className="space-y-4">
            <div><Input label="Name" name="name" value={formValues.name} onChange={handleFormChange} />{formErrors.name && <p className="mt-1 text-xs text-red-400">{formErrors.name}</p>}</div>
            <div><Select label="Category" name="category" value={formValues.category} onChange={handleFormChange}><option value="">-- Select category --</option>{CATEGORY_OPTIONS.map(cat => <option key={cat} value={cat}>{cat}</option>)}</Select>{formErrors.category && <p className="mt-1 text-xs text-red-400">{formErrors.category}</p>}</div>
            <div><Select label="Price Type" name="priceType" value={formValues.priceType} onChange={handleFormChange}><option value="">-- Select price type --</option>{PRICE_TYPE_OPTIONS.map(pt => <option key={pt} value={pt}>{pt}</option>)}</Select>{formErrors.priceType && <p className="mt-1 text-xs text-red-400">{formErrors.priceType}</p>}</div>
            <div><Input label="Base Price (USD)" name="basePriceUsd" value={formValues.basePriceUsd} onChange={handleFormChange} placeholder="e.g. 120" />{formErrors.basePriceUsd && <p className="mt-1 text-xs text-red-400">{formErrors.basePriceUsd}</p>}</div>
            <div className="pt-4 flex justify-end space-x-2"><button type="button" onClick={handleCloseModal} className="px-4 py-2 text-slate-400 hover:text-white">Cancel</button><button type="submit" disabled={isSaveDisabled} className="px-6 py-2 bg-teal-600 text-white rounded-md font-bold hover:bg-teal-700 disabled:bg-slate-500 disabled:cursor-not-allowed">{editingAddOn ? 'Save Changes' : 'Add Add-on'}</button></div>
        </form>
      </Modal>
    </div>
  );
};

export default AddOnsPage;