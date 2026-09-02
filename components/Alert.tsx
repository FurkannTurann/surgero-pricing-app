
import React from 'react';

interface AlertProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose?: () => void;
}

const Alert: React.FC<AlertProps> = ({ message, type, onClose }) => {
  const baseClasses = 'p-4 rounded-md flex items-center justify-between';
  const typeClasses = {
    success: 'bg-green-100 text-green-800',
    error: 'bg-red-100 text-red-800',
    info: 'bg-blue-100 text-blue-800',
  };

  return (
    <div className={`${baseClasses} ${typeClasses[type]}`}>
      <span>{message}</span>
      {onClose && (
        <button onClick={onClose} className="ml-4">
          &times;
        </button>
      )}
    </div>
  );
};

export const Toast: React.FC<{ message: string; type: 'success' | 'error' }> = ({ message, type }) => {
    const typeClasses = {
        success: 'bg-green-600 text-white',
        error: 'bg-red-600 text-white',
    };
    return (
        <div className={`fixed bottom-5 right-5 p-4 rounded-lg shadow-lg ${typeClasses[type]} animate-pulse`}>
            {message}
        </div>
    );
};

export default Alert;
   