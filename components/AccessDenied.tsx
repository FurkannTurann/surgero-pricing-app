
import React from 'react';
import Card from './Card';
import { useAppContext } from '../context/AppContext';
import { Page, UserRole } from '../types/entities';

const AccessDenied: React.FC = () => {
    const { setPage, currentUser } = useAppContext();

    const role: UserRole | undefined = currentUser?.role;

    const getReturnPage = (): { page: Page, name: string } => {
        // All roles have access to the calculator, making it a safe default.
        return { page: 'calculator', name: 'Price Calculator' };
    };

    const returnPageInfo = getReturnPage();

  return (
    <Card className="text-center max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
      <p className="text-slate-600 mb-6">Your current role (<span className="font-semibold">{role}</span>) does not have permission to view this page.</p>
      <button
        onClick={() => setPage(returnPageInfo.page)}
        className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 transition-colors"
      >
        Return to {returnPageInfo.name}
      </button>
    </Card>
  );
};

export default AccessDenied;
