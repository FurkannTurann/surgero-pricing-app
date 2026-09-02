// src/components/Navbar.tsx

import React from 'react';
import { useAppContext } from '../context/AppContext';
import { Page, UserRole } from '../types/entities';

const NavItem: React.FC<{
  label: string;
  targetPage: Page;
  activePage: Page;
  onClick: (page: Page) => void;
}> = ({ label, targetPage, activePage, onClick }) => {
  const isActive = activePage === targetPage;
  return (
    <button
      onClick={() => onClick(targetPage)}
      className={`px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200 relative ${
        isActive
          ? 'text-teal-400 font-semibold'
          : 'text-slate-300 hover:bg-slate-700'
      }`}
    >
      {label}
      {isActive && (
        <span
          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4/5 h-0.5 bg-teal-400 rounded-full"
        ></span>
      )}
    </button>
  );
};

const Navbar: React.FC = () => {
  const { page, setPage, logout, currentUser } = useAppContext();
  const userRole = currentUser?.role;

  const navLinks: { label: string; page: Page; roles: UserRole[] }[] = [
    { label: 'Price Calculator', page: 'calculator', roles: ['Admin', 'Team', 'Doctor'] },
    { label: 'Manage Data', page: 'treatments', roles: ['Admin', 'Team', 'Doctor'] },
    { label: 'Add-ons', page: 'addons', roles: ['Admin', 'Team'] },
    { label: 'Quotes History', page: 'history', roles: ['Admin', 'Team'] },
    // 🔹 Doctors sayfası – sadece Admin görüyor
    { label: 'Doctors', page: 'doctors', roles: ['Admin'] },
    { label: 'Admin Panel', page: 'admin', roles: ['Admin'] },
  ];

  return (
    <header className="bg-slate-800 shadow-md sticky top-0 z-50">
      {/* GÜNCELLEME: max-w-7xl yerine w-full max-w-[95%] yapıldı */}
      <div className="w-full max-w-[95%] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <span className="font-bold text-xl text-teal-500">surgero</span>
            <span className="text-xl text-slate-600 mx-2">|</span>
            <span className="text-lg text-slate-300">Price Calculator</span>
          </div>

          <div className="flex items-center space-x-1">
            {navLinks
              .filter(link => userRole && link.roles.includes(userRole))
              .map(link => (
                <NavItem
                  key={link.page}
                  label={link.label}
                  targetPage={link.page}
                  activePage={page}
                  onClick={setPage}
                />
              ))}

            <div className="flex items-center ml-4">
              <div className="text-right mr-3">
                <p className="text-sm font-medium text-slate-100">
                  {currentUser?.name}
                </p>
                <p className="text-xs text-slate-400">{currentUser?.role}</p>
              </div>
              <button
                onClick={logout}
                title="Log Out"
                className="p-2 text-sm font-medium text-slate-400 hover:bg-slate-700 rounded-full transition-colors duration-200"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;