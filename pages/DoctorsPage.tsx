import React, { useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import Modal from '../components/Modal';
import { Input } from '../components/Input';
import { Doctor, DEPARTMENTS, Department } from '../types/entities'; // User kullanılmadığı için kaldırıldı
import { db, storage } from '../services/firebase';
import { doc, writeBatch, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

interface DoctorFormValues {
  name: string;
  email: string;
  code: string;
  priceMultiplier: string;
  imageUrl: string;
}

const emptyFormValues: DoctorFormValues = {
  name: '',
  email: '',
  code: '',
  priceMultiplier: '30',
  imageUrl: '',
};

const DoctorsPage: React.FC = () => {
  const { doctors, users, currentUser, updateDoctorPriceMultiplier, showNotification, setDoctors } = useAppContext();

  // --- STATE ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDoctorId, setEditingDoctorId] = useState<string | null>(null);
  
  // Form State
  const [formValues, setFormValues] = useState<DoctorFormValues>(emptyFormValues);
  const [selectedDepartments, setSelectedDepartments] = useState<Department[]>(['Plastic Surgery']);
  
  // Image Upload State
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Local Markup State
  const [doctorPercents, setDoctorPercents] = useState<Record<string, string>>({});

  useEffect(() => {
    const initial: Record<string, string> = {};
    doctors.forEach((doc) => {
      const multiplier = doc.priceMultiplier ?? 1;
      const percent = (multiplier - 1) * 100;
      initial[doc.uid] = Number.isFinite(percent) ? percent.toFixed(0) : '0';
    });
    setDoctorPercents(initial);
  }, [doctors]);

  if (!currentUser || currentUser.role !== 'Admin') {
    return (
      <div className="bg-slate-800/70 border border-slate-700 rounded-xl shadow p-6 text-center">
        <h2 className="text-lg font-semibold text-slate-50 mb-2">Access Denied</h2>
        <p className="text-sm text-slate-400">Only Admins can view and edit doctor settings.</p>
      </div>
    );
  }

  // --- HANDLERS ---

  const handlePercentChange = (uid: string, value: string) => {
    if (value === '' || /^-?\d*\.?\d*$/.test(value)) {
      setDoctorPercents((prev) => ({ ...prev, [uid]: value }));
    }
  };

  // 🛠️ DEĞİŞTİRİLECEK ALAN: handleSaveMarkup fonksiyonu
  const handleSaveMarkup = async (doctorUid: string) => {
    const raw = doctorPercents[doctorUid] ?? '0';
    const safePercent = parseFloat(raw) || 0;
    const multiplier = 1 + safePercent / 100;
    
    try {
        // İşlem başladığını göstermek için loading state'i açabiliriz (opsiyonel)
        setUploading(true); 

        // 1. Batch Başlatma (İki işlemi paketliyoruz)
        const batch = writeBatch(db);
        const doctorRef = doc(db, 'doctors', doctorUid);
        const userRef = doc(db, 'users', doctorUid);

        // 2. Doctors Koleksiyonunu Güncelle
        // { merge: true } ile set kullanıyoruz ki doküman yoksa hata vermesin, oluştursun.
        batch.set(doctorRef, { priceMultiplier: multiplier }, { merge: true });

        // 3. Users Koleksiyonunu Güncelle
        batch.set(userRef, { priceMultiplier: multiplier }, { merge: true });

        // 4. Paketi Gönder (Commit)
        await batch.commit();

        // 5. Arayüzü (Local State) Güncelle
        // setDoctors zaten AppContext içinde LocalStorage ile senkronize çalışıyor.
        setDoctors(prev => prev.map(d => d.uid === doctorUid ? { ...d, priceMultiplier: multiplier } : d));
        
        showNotification('Markup updated in both databases.', 'success');

    } catch (error) {
        console.error("Markup update failed:", error);
        showNotification("Failed to update markup.", "error");
    } finally {
        setUploading(false);
    }
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormValues(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImageFile(e.target.files[0]);
    }
  };

  const toggleDepartment = (dept: Department) => {
    setSelectedDepartments(prev => 
      prev.includes(dept) 
        ? prev.filter(d => d !== dept) 
        : [...prev, dept]
    );
  };

  

  const openEditModal = (doctor: Doctor) => {
    setEditingDoctorId(doctor.uid);
    
    // Email eşleştirme
    let effectiveEmail = doctor.email;
    if (!effectiveEmail && users.length > 0) {
        const linkedUser = users.find(u => u.uid === doctor.uid);
        if (linkedUser) {
            effectiveEmail = linkedUser.email;
        }
    }

    const currentMultiplier = doctor.priceMultiplier ?? 1;
    const currentPercent = ((currentMultiplier - 1) * 100).toFixed(0);

    setFormValues({
        name: doctor.name,
        email: effectiveEmail || '',
        code: doctor.code,
        priceMultiplier: currentPercent,
        imageUrl: doctor.imageUrl || ''
    });

    setSelectedDepartments(doctor.departments.length > 0 ? doctor.departments : ['Plastic Surgery']);
    setImageFile(null);
    setIsModalOpen(true);
  };

  const handleDeleteDoctor = async (uid: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete ${name}? This cannot be undone.`)) return;

    try {
        await deleteDoc(doc(db, 'doctors', uid));
        await deleteDoc(doc(db, 'users', uid));
        
        // ✅ Arayüzden sil
        setDoctors(prev => prev.filter(d => d.uid !== uid));
        
        showNotification(`${name} deleted successfully.`, 'success');
    } catch (error) {
        console.error("Delete failed:", error);
        showNotification("Failed to delete doctor.", "error");
    }
  };

  const uploadImageToStorage = async (file: File, uid: string): Promise<string> => {
    const storageRef = ref(storage, `doctors/${uid}/${file.name}`);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("🚀 Submit button clicked. Starting process...");

    if (!formValues.name || !formValues.email || !formValues.code) {
        showNotification('Please fill all required fields.', 'error');
        return;
    }

    if (selectedDepartments.length === 0) {
        showNotification('Please select at least one department.', 'error');
        return;
    }

    // ✅ Sadece Edit Modu Kaldığı için ID kontrolü
    if (!editingDoctorId) {
        showNotification('Error: Doctor ID missing.', 'error');
        return;
    }

    setUploading(true);
    const multiplier = 1 + (Number(formValues.priceMultiplier) / 100);
    const targetUid = editingDoctorId;

    try {
        let finalImageUrl = formValues.imageUrl;
        if (imageFile) {
            console.log("📸 Uploading image...");
            finalImageUrl = await uploadImageToStorage(imageFile, targetUid);
        } else if (!finalImageUrl) {
             finalImageUrl = ''; // Boş string yerine aşağıda null kullanacağız
        }

        console.log("💾 Preparing database batch write...");
        const batch = writeBatch(db);
        const doctorRef = doc(db, 'doctors', targetUid);
        const userRef = doc(db, 'users', targetUid);

        // Veri Hazırlama
        const doctorData = {
            uid: targetUid,
            name: formValues.name,
            email: formValues.email,
            code: formValues.code.toUpperCase(),
            departments: selectedDepartments,
            priceMultiplier: multiplier,
            imageUrl: finalImageUrl || null, // ✅ NULL kullanımı (Undefined hatasını çözer)
            isActive: true, 
        };

        const userData = {
            name: formValues.name,
            email: formValues.email,
            doctorCode: formValues.code.toUpperCase()
        };

        // --- UPDATE MODE (Only) ---
        console.log(`♻️ Updating/Repairing Doctor ID: ${editingDoctorId}`);
        const existingDoc = doctors.find(d => d.uid === editingDoctorId);
        
        // DB Update
        batch.set(doctorRef, {
            ...doctorData,
            color: existingDoc?.color || '#10b981',
            isActive: existingDoc?.isActive ?? true
        }, { merge: true });

        batch.set(userRef, userData, { merge: true });
        
        await batch.commit();

        // ✅ Local State Update (With Sync)
        setDoctors(prev => prev.map(d => d.uid === targetUid ? {
            ...d,
            ...doctorData,
            color: existingDoc?.color || '#10b981',
            isActive: existingDoc?.isActive ?? true,
            imageUrl: finalImageUrl || d.imageUrl
        } : d));

        console.log("✅ Update Success!");
        showNotification('Doctor profile updated successfully.', 'success');

        setIsModalOpen(false);
        setFormValues(emptyFormValues);

    } catch (error: any) {
        console.error("❌ Operation failed:", error);
        showNotification(`Error: ${error.message || 'Check console'}`, 'error');
    } finally {
        setUploading(false);
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().substring(0, 2);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-50">Manage Doctors</h1>
          <p className="mt-1 text-sm text-slate-400">
            Configure doctors departments and sale price markups.
          </p>
        </div>
        {/* ✅ BUTON KALDIRILDI */}
      </div>

      {doctors.length === 0 ? (
        <div className="text-center py-12 bg-slate-800/50 rounded-xl border border-dashed border-slate-700">
            <p className="text-slate-400">No doctors found. Add users with 'Doctor' role in Admin Panel.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {doctors.map((doc) => {
            const percentValue = doctorPercents[doc.uid] ?? '0';
            const currentMultiplier = doc.priceMultiplier ?? 1;
            const currentPercent = (currentMultiplier - 1) * 100;

            return (
              <div key={doc.uid} className="border border-slate-700/70 bg-slate-800/80 rounded-2xl p-5 shadow-sm hover:border-teal-500/50 transition-all group relative">
                
                {/* ACTION BUTTONS (Edit & Delete) */}
                <div className="absolute top-4 right-4 flex gap-2 z-10">
                    <button 
                        onClick={() => openEditModal(doc)}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-full transition-colors"
                        title="Edit Doctor"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>
                    <button 
                        onClick={() => handleDeleteDoctor(doc.uid, doc.name)}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded-full transition-colors"
                        title="Delete Doctor"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                </div>

                <div className="flex justify-between items-start mb-4 gap-4 pr-16"> 
                    <div className="flex-1">
                        <h3 className="text-lg font-bold text-slate-100 line-clamp-1">{doc.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="px-1.5 py-0.5 rounded bg-slate-700/50 border border-slate-600 text-[10px] font-mono text-slate-300">
                                {doc.code}
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 truncate">{doc.email}</p>
                    </div>

                    <div className="flex-shrink-0">
                        {doc.imageUrl ? (
                            <img src={doc.imageUrl} alt={doc.name} className="w-12 h-12 rounded-full object-cover border-2 border-slate-600 shadow-md" />
                        ) : (
                            <div className="w-12 h-12 rounded-full bg-slate-700 border-2 border-slate-600 flex items-center justify-center text-slate-300 font-bold text-sm shadow-md">
                                {getInitials(doc.name)}
                            </div>
                        )}
                    </div>
                </div>

                <div className="mb-5 min-h-[2.5rem]">
                    <div className="flex flex-wrap gap-1.5">
                        {doc.departments && doc.departments.length > 0 ? (
                            doc.departments.map(dept => (
                                <span key={dept} className="px-2 py-1 rounded text-[10px] font-medium bg-slate-700 text-slate-300 border border-slate-600">
                                    {dept}
                                </span>
                            ))
                        ) : (
                            <span className="text-xs text-slate-500 italic">No department</span>
                        )}
                    </div>
                </div>

                <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-700/50">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs text-slate-400">Sale Markup</span>
                        <span className="text-sm font-bold text-teal-400">
                            +{currentPercent.toFixed(0)}% <span className="text-xs font-normal text-slate-500 ml-1">({currentMultiplier.toFixed(2)}x)</span>
                        </span>
                    </div>
                    
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <input
                                type="number"
                                value={percentValue}
                                onChange={(e) => handlePercentChange(doc.uid, e.target.value)}
                                className="w-full bg-slate-800 border border-slate-600 rounded-lg py-1.5 pl-3 pr-8 text-sm text-white focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all"
                                placeholder="0"
                            />
                            <span className="absolute right-3 top-1.5 text-slate-400 text-sm">%</span>
                        </div>
                        <button
                            onClick={() => handleSaveMarkup(doc.uid)}
                            className="bg-teal-600 hover:bg-teal-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm"
                        >
                            SAVE
                        </button>
                    </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={'Edit Doctor Profile'}>
        <form onSubmit={handleFormSubmit} className="space-y-4">
            
            {/* Image Upload Section */}
            <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Profile Photo</label>
                <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                         {imageFile ? (
                            <div className="w-16 h-16 rounded-full overflow-hidden border border-slate-500">
                                <img src={URL.createObjectURL(imageFile)} alt="Preview" className="w-full h-full object-cover" />
                            </div>
                        ) : formValues.imageUrl ? (
                            <img src={formValues.imageUrl} alt="Current" className="w-16 h-16 rounded-full object-cover border border-slate-500" />
                        ) : (
                            <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center border border-slate-600 text-xs text-slate-400">
                                No Img
                            </div>
                        )}
                    </div>
                    <div className="flex-1">
                        <input 
                            type="file" 
                            accept="image/*"
                            onChange={handleFileChange}
                            className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-slate-700 file:text-teal-400 hover:file:bg-slate-600 cursor-pointer"
                        />
                        <div className="mt-2 text-xs text-slate-500">
                            or paste a URL below:
                        </div>
                        <Input 
                            name="imageUrl" 
                            value={formValues.imageUrl} 
                            onChange={handleFormChange} 
                            placeholder="https://..." 
                            className="mt-1"
                        />
                    </div>
                </div>
            </div>

            <div className="border-t border-slate-700 my-4"></div>

            <div><Input label="Full Name" name="name" value={formValues.name} onChange={handleFormChange} placeholder="e.g. Dr. Ahmet Yilmaz" required /></div>
            
            <div className="grid grid-cols-2 gap-4">
                <Input label="Doctor Code" name="code" value={formValues.code} onChange={handleFormChange} placeholder="e.g. DR_AY" required />
                <div>
                    <Input label="Email Address" name="email" type="email" value={formValues.email} onChange={handleFormChange} placeholder="doctor@clinic.com" required />
                    <p className="text-[10px] text-amber-500 mt-1">* Updates DB record only. Does not change Login Auth.</p>
                </div>
            </div>

            {/* Multi-Select Departments */}
            <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Departments</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                    {DEPARTMENTS.map(dept => (
                        <label key={dept} className="flex items-center space-x-2 cursor-pointer group">
                            <input 
                                type="checkbox" 
                                checked={selectedDepartments.includes(dept)}
                                onChange={() => toggleDepartment(dept)}
                                className="rounded border-slate-600 bg-slate-700 text-teal-600 focus:ring-teal-500 transition-all"
                            />
                            <span className={`text-sm group-hover:text-teal-400 transition-colors ${selectedDepartments.includes(dept) ? 'text-slate-200' : 'text-slate-400'}`}>
                                {dept}
                            </span>
                        </label>
                    ))}
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Default Markup Percentage</label>
                <div className="relative">
                    <input type="number" name="priceMultiplier" value={formValues.priceMultiplier} onChange={handleFormChange} className="block w-full px-3 py-2 border border-slate-600 bg-slate-700 text-slate-200 rounded-md focus:ring-teal-500 focus:border-teal-500 sm:text-sm" placeholder="30" />
                    <span className="absolute right-3 top-2 text-slate-400 text-sm">%</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">Example: 30% markup means Base Price x 1.30</p>
            </div>

            <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white transition-colors">Cancel</button>
                <button 
                    type="submit" 
                    disabled={uploading}
                    className="px-6 py-2 bg-teal-600 text-white rounded-md font-bold hover:bg-teal-500 shadow-lg shadow-teal-900/20 transition-all disabled:opacity-50 disabled:cursor-wait flex items-center gap-2"
                >
                    {uploading && <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                    Save Changes
                </button>
            </div>
        </form>
      </Modal>
    </div>
  );
};

export default DoctorsPage;