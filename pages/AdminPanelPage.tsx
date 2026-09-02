import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import Card from '../components/Card';
import Table from '../components/Table';
import Modal from '../components/Modal';
import { Input, Select } from '../components/Input';
import { USER_ROLES, UserRole, User, AuditLog } from '../types/entities';
import { Navigate } from 'react-router-dom';
import { doc, updateDoc, setDoc, onSnapshot, collection, query, orderBy } from 'firebase/firestore'; // onSnapshot eklendi
import { sendPasswordResetEmail } from 'firebase/auth';
import { db, auth, firebaseConfig } from '../services/firebase';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { fetchAuditLogs, logAudit } from '../services/auditService';

const AdminPanelPage: React.FC = () => {
    const { currentUser, showNotification } = useAppContext(); // users'ı context'ten almaya gerek kalmadı
    const [searchTerm, setSearchTerm] = useState('');
    
    // ✅ PROFESYONEL ÇÖZÜM: Canlı Veri State'i
    const [realtimeUsers, setRealtimeUsers] = useState<User[]>([]);
    
    const [activeTab, setActiveTab] = useState<'users' | 'audit'>('users');
    const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    
    const emptyForm = {
        name: '',
        email: '',
        password: '',
        role: 'User' as UserRole,
        doctorCode: '',
    };
    const [formData, setFormData] = useState(emptyForm);
    const [isProcessing, setIsProcessing] = useState(false);

    // 1. GÜVENLİK KONTROLÜ
    if (!currentUser) return <div className="p-8 text-center text-slate-400">Loading...</div>;
    if (currentUser.role !== 'Admin') {
        return <Navigate to="/" replace />;
    }

    // ✅ CANLI VERİ AKIŞI (REAL-TIME LISTENER)
    // Bu sayfa açık olduğu sürece veritabanındaki her değişikliği anında yakalar.
    useEffect(() => {
        // Kullanıcıları isme göre sıralı getir
        const q = query(collection(db, 'users'), orderBy('name', 'asc'));
        
        // Dinleyiciyi başlat
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const liveData: User[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data() as User;
                // UID veritabanında yoksa doc.id'yi kullan
                liveData.push({ ...data, uid: data.uid || doc.id });
            });
            setRealtimeUsers(liveData);
        }, (error) => {
            console.error("Realtime fetch error:", error);
            showNotification("Connection lost. Realtime updates disabled.", "error");
        });

        // Sayfadan çıkınca dinlemeyi durdur (Performans için şart)
        return () => unsubscribe();
    }, []);

    // Audit Logları Yükle
    useEffect(() => {
        if (activeTab === 'audit') {
            fetchAuditLogs(50).then(setAuditLogs);
        }
    }, [activeTab]);

    // --- HANDLERS ---

    const handleAddClick = () => {
        setEditingUser(null);
        setFormData(emptyForm);
        setIsModalOpen(true);
    };

    const handleEditClick = (user: User) => {
        setEditingUser(user);
        setFormData({
            name: user.name || '',
            email: user.email || '',
            password: '',
            role: user.role || 'User',
            doctorCode: user.doctorCode || '',
        });
        setIsModalOpen(true);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const createUserInAuth = async (email: string, password: string): Promise<string> => {
        const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
        const secondaryAuth = getAuth(secondaryApp);
        try {
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
            await signOut(secondaryAuth);
            return userCredential.user.uid;
        } catch (error: any) {
            throw error;
        } finally {
            await deleteApp(secondaryApp);
        }
    };

    const handleSaveChanges = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsProcessing(true);

        try {
            if (!formData.email || !formData.name) throw new Error("Name and Email are required.");

            const userData: any = {
                name: formData.name,
                email: formData.email,
                role: formData.role,
                doctorCode: formData.role === 'Doctor' ? formData.doctorCode : null,
            };

            if (editingUser) {
                const userRef = doc(db, 'users', editingUser.uid);
                await updateDoc(userRef, userData);
                logAudit("Update User", `Updated user: ${formData.email}`, currentUser.email, "User");
                showNotification(`User updated successfully.`, 'success');
            } else {
                if (!formData.password || formData.password.length < 6) throw new Error("Password must be at least 6 characters.");
                const newUid = await createUserInAuth(formData.email, formData.password);
                await setDoc(doc(db, 'users', newUid), { ...userData, uid: newUid, isActive: true });
                logAudit("Create User", `Created user: ${formData.email}`, currentUser.email, "User");
                showNotification(`User created!`, 'success');
            }
            setIsModalOpen(false);
        } catch (error: any) {
            console.error("Save failed:", error);
            showNotification(error.message || "Failed to save user.", "error");
        } finally {
            setIsProcessing(false);
        }
    };

    // 🔥 SUSPEND / ACTIVATE (SADECE VERİTABANINI GÜNCELLER, EKRAN KENDİ DEĞİŞİR)
    const handleToggleStatus = async (user: User) => {
        const currentStatus = user.isActive !== false;
        const newStatus = !currentStatus;
        const action = newStatus ? "Activate" : "Suspend";
        
        console.log(`Action: ${action} for ${user.email}`);

        try {
            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, { isActive: newStatus });
            
            logAudit(`${action} User`, `${action}d user: ${user.email}`, currentUser.email, "User");
            showNotification(`User ${newStatus ? 'activated' : 'suspended'}.`, newStatus ? 'success' : 'warning');
            
            // BURADA HİÇBİR LOCAL STATE GÜNCELLEMESİ YAPMIYORUZ.
            // onSnapshot YUKARIDA BUNU OTOMATİK ALGILAYIP EKRANI YENİLEYECEK.
        } catch (error) {
            console.error("Status update failed:", error);
            showNotification("Failed to update status.", "error");
        }
    };

    const handleSendPasswordReset = async () => {
        if (!formData.email) return;
        if (!window.confirm(`Send password reset email to ${formData.email}?`)) return;
        try {
            await sendPasswordResetEmail(auth, formData.email);
            logAudit("Reset Password", `Sent reset email to: ${formData.email}`, currentUser.email, "User");
            showNotification(`Email sent.`, 'success');
        } catch (error) {
            showNotification("Failed to send email.", "error");
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        showNotification("Copied!", "success");
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return <span className="text-slate-600">-</span>;
        return new Date(dateStr).toLocaleString('tr-TR', { 
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' 
        });
    };

    // FİLTRELEME (Artık realtimeUsers üzerinden yapılıyor)
    const filteredUsers = realtimeUsers.filter(user => 
        (user.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (user.email?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );

    const getRoleBadgeColor = (role: string) => {
        switch (role) {
            case 'Admin': return 'bg-red-500/20 text-red-300 border-red-500/30';
            case 'Doctor': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
            case 'Team': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
            default: return 'bg-slate-700 text-slate-400 border-slate-600';
        }
    };

    return (
        <div className="max-w-full space-y-6">
            
            {/* TABS */}
            <div className="flex items-center space-x-1 bg-slate-800 p-1 rounded-lg w-fit border border-slate-700">
                <button 
                    onClick={() => setActiveTab('users')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'users' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    Users Management
                </button>
                <button 
                    onClick={() => setActiveTab('audit')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'audit' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    Audit Logs
                </button>
            </div>

            {/* USERS TAB */}
            {activeTab === 'users' && (
                <Card title="User Management">
                    <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                        <div className="flex-1 w-full relative">
                            <input 
                                type="text" 
                                placeholder="Search users by name or email..." 
                                className="w-full sm:w-72 pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-teal-500 transition-colors"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            <svg className="w-4 h-4 absolute left-3 top-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                        <button onClick={handleAddClick} className="bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 shadow-lg shadow-teal-900/20">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg> 
                            Add User
                        </button>
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-slate-700">
                        <Table headers={["Name", "Email", "Role", "Last Login", "Status", "Actions"]}>
                            {filteredUsers.map(user => {
                                const isActive = user.isActive !== false;
                                return (
                                    <tr key={user.uid} className={`border-b border-slate-700/50 transition-colors ${!isActive ? 'bg-red-900/10' : 'hover:bg-slate-800/30'}`}>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className={`text-sm font-medium text-slate-100 ${!isActive && 'opacity-60'}`}>{user.name}</div>
                                            <div onClick={() => copyToClipboard(user.uid)} className="text-[10px] font-mono text-slate-500 cursor-pointer hover:text-teal-400 mt-1 flex items-center gap-1">UID: {user.uid.substring(0,8)}...</div>
                                        </td>
                                        <td className={`px-6 py-4 whitespace-nowrap text-sm text-slate-400 ${!isActive && 'opacity-60'}`}>{user.email}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2.5 py-1 text-xs font-bold rounded-full border ${getRoleBadgeColor(user.role)} ${!isActive && 'opacity-60'}`}>{user.role}</span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-400 font-mono">{formatDate(user.lastLoginAt)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {isActive ? 
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Active</span> : 
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 uppercase tracking-wider"><span className="w-1.5 h-1.5 rounded-full bg-red-400"></span> Suspended</span>
                                            }
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                                            <div className="flex items-center gap-3">
                                                <button onClick={() => handleEditClick(user)} className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors" title="Edit"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                                                {currentUser.email !== user.email && (
                                                    <button onClick={() => handleToggleStatus(user)} className={`p-1.5 rounded hover:bg-slate-700 transition-colors ${isActive ? 'text-slate-400 hover:text-red-400' : 'text-red-400 hover:text-emerald-400'}`} title={isActive ? "Suspend" : "Activate"}>
                                                        {isActive ? 
                                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg> : 
                                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                        }
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </Table>
                        {filteredUsers.length === 0 && <div className="text-center py-8 text-slate-500 italic">No users found.</div>}
                    </div>
                </Card>
            )}

            {activeTab === 'audit' && (
                <Card title="System Audit Logs">
                    <div className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-800">
                        <table className="min-w-full text-sm text-left text-slate-400">
                            <thead className="text-xs text-slate-200 uppercase bg-slate-700/50">
                                <tr>
                                    <th className="px-6 py-3 font-medium">Time</th>
                                    <th className="px-6 py-3 font-medium">Action</th>
                                    <th className="px-6 py-3 font-medium">Details</th>
                                    <th className="px-6 py-3 font-medium">Performed By</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700">
                                {auditLogs.length > 0 ? auditLogs.map(log => (
                                    <tr key={log.id} className="hover:bg-slate-700/30 transition-colors">
                                        <td className="px-6 py-4 font-mono text-xs text-slate-500">{formatDate(log.timestamp)}</td>
                                        <td className="px-6 py-4 font-medium text-teal-400">{log.action}</td>
                                        <td className="px-6 py-4 text-slate-300">{log.details}</td>
                                        <td className="px-6 py-4 text-xs italic text-slate-500">{log.performedBy}</td>
                                    </tr>
                                )) : (
                                    <tr><td colSpan={4} className="text-center py-8">No logs found.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingUser ? `Edit User` : 'Create New User'}>
                <form onSubmit={handleSaveChanges} className="space-y-5">
                    <Input label="Full Name" name="name" value={formData.name} onChange={handleChange} required />
                    <Input label="Email Address" name="email" type="email" value={formData.email} onChange={handleChange} required />
                    {!editingUser && (
                        <div>
                            <Input label="Password" name="password" type="password" value={formData.password} onChange={handleChange} placeholder="******" required />
                            <p className="text-[10px] text-slate-500 mt-1">Min 6 chars.</p>
                        </div>
                    )}
                    <Select label="Role" name="role" value={formData.role} onChange={handleChange}>
                        {USER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </Select>
                    {formData.role === 'Doctor' && (
                        <div className="animate-in fade-in slide-in-from-top-2">
                            <Input label="Doctor Code" name="doctorCode" value={formData.doctorCode} onChange={handleChange} placeholder="e.g. DR_XY" required />
                        </div>
                    )}
                    {editingUser && (
                        <div className="border-t border-slate-700 pt-3">
                            <button type="button" onClick={handleSendPasswordReset} className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs rounded border border-slate-600">Send Password Reset Email</button>
                        </div>
                    )}
                    <div className="pt-4 flex justify-end gap-3 border-t border-slate-700">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white" disabled={isProcessing}>Cancel</button>
                        <button type="submit" disabled={isProcessing} className="px-6 py-2 bg-teal-600 text-white rounded font-bold hover:bg-teal-500 disabled:opacity-50">{isProcessing ? 'Processing...' : 'Save'}</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default AdminPanelPage;