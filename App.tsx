// src/App.tsx

import React, { useEffect } from 'react';
import { useAppContext } from './context/AppContext';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import PriceCalculatorPage from './pages/PriceCalculatorPage';
import ManageTreatmentsPage from './pages/ManageTreatmentsPage';
import AddOnsPage from './pages/AddOnsPage';
import QuotesHistoryPage from './pages/QuotesHistoryPage';
import AdminPanelPage from './pages/AdminPanelPage';
import AccessDenied from './components/AccessDenied';
import { Toast } from './components/Alert';
import { UserRole, Page } from './types/entities';
import { testFirebaseConnection } from './utils/firebaseTest';

// 🔹 Doctors sayfası
import DoctorsPage from './pages/DoctorsPage';

const App: React.FC = () => {
  const { page, currentUser, quoteToDuplicate, notification } = useAppContext();

  useEffect(() => {
    // Run a single Firestore write test on app load to confirm connection.
    testFirebaseConnection();
  }, []);

  if (!currentUser) {
    return <LoginPage />;
  }

  const renderPage = () => {
    const role: UserRole = currentUser.role;

    // Role-based access control for pages
    const pageAccess: Record<Page, UserRole[]> = {
      calculator: ['Admin', 'Team', 'Doctor'],
      treatments: ['Admin', 'Team', 'Doctor'],
      addons: ['Admin', 'Team'],
      history: ['Admin', 'Team'],
      admin: ['Admin'],
      // 🔹 Doctors sayfası sadece Admin
      doctors: ['Admin'],
    };

    if (!pageAccess[page] || !pageAccess[page].includes(role)) {
      return <AccessDenied />;
    }

    switch (page) {
      case 'calculator':
        return <PriceCalculatorPage key={quoteToDuplicate?.id || 'new'} />;
      case 'treatments':
        return <ManageTreatmentsPage />;
      case 'addons':
        return <AddOnsPage />;
      case 'history':
        return <QuotesHistoryPage />;
      case 'admin':
        return <AdminPanelPage />;
      // 🔹 Doctors route
      case 'doctors':
        return <DoctorsPage />;
      default:
        return <PriceCalculatorPage />;
    }
  };

  return (
    <div className="min-h-screen font-sans">
      <Navbar />
      <main className="p-4 sm:p-6 lg:p-8">
        {/* GÜNCELLEME: max-w-7xl yerine w-full max-w-[95%] yapıldı */}
        <div className="w-full max-w-[95%] mx-auto">
          {renderPage()}
        </div>
      </main>
      {notification && (
        <Toast message={notification.message} type={notification.type} />
      )}
    </div>
  );
};

export default App;