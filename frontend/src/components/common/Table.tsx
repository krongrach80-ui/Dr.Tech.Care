import React from 'react';
import { formatEmpty } from '../../i18n';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render?: (row: T, index: number) => React.ReactNode;
  className?: string;
  headerClassName?: string;
  align?: 'left' | 'center' | 'right';
}

export interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T, index: number) => string | number;
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  className?: string;
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  isLoading = false,
  emptyMessage = 'ไม่พบข้อมูลในระบบ',
  onRowClick,
  className = '',
}: TableProps<T>) {
  const alignStyles = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };

  return (
    <div className={`w-full overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60 ${className}`}>
      <table className="w-full text-left text-sm text-slate-300 border-collapse">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-950/60 text-xs font-semibold uppercase tracking-wider text-slate-400">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3.5 ${alignStyles[col.align || 'left']} ${col.headerClassName || ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {isLoading ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-slate-400">
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs">กำลังโหลดข้อมูล...</span>
                </div>
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-slate-400">
                <p className="text-sm font-medium">{emptyMessage}</p>
              </td>
            </tr>
          ) : (
            data.map((row, index) => (
              <tr
                key={keyExtractor(row, index)}
                onClick={() => onRowClick && onRowClick(row)}
                className={`transition-colors duration-150 ${
                  onRowClick
                    ? 'cursor-pointer hover:bg-slate-800/60 hover:text-white'
                    : 'hover:bg-slate-800/30'
                }`}
              >
                {columns.map((col) => {
                  const val = (row as any)[col.key];
                  return (
                    <td
                      key={col.key}
                      className={`px-4 py-3.5 whitespace-nowrap text-sm ${alignStyles[col.align || 'left']} ${
                        col.className || ''
                      }`}
                    >
                      {col.render ? col.render(row, index) : formatEmpty(val)}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
