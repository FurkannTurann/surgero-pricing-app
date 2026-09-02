
import React, { ReactNode } from 'react';

interface TableProps {
  headers: string[];
  children: ReactNode;
  emptyMessage?: string;
}

const Table: React.FC<TableProps> = ({ headers, children, emptyMessage = "No data available." }) => {
  const hasContent = React.Children.count(children) > 0;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-700">
        <thead className="bg-slate-700/50">
          <tr>
            {headers.map(header => (
              <th
                key={header}
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-slate-800 divide-y divide-slate-700">
          {hasContent ? children : (
             <tr>
                <td colSpan={headers.length} className="px-6 py-4 text-center text-slate-400">
                    {emptyMessage}
                </td>
             </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default Table;