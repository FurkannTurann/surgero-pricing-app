
import React, { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
}

const Card: React.FC<CardProps> = ({ children, className = '', title }) => {
  return (
    <div className={`bg-slate-800 rounded-lg shadow-xl shadow-black/20 p-6 ${className}`}>
      {title && <h2 className="text-xl font-semibold text-slate-100 mb-4 pb-2 border-b border-slate-600">{title}</h2>}
      {children}
    </div>
  );
};

export default Card;