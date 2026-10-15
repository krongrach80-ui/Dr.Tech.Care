import React from 'react';

export interface CardProps {
  children: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  title,
  subtitle,
  action,
  footer,
  className = '',
  bodyClassName = '',
}) => {
  return (
    <div
      className={`bg-slate-900/80 backdrop-blur-md border border-slate-800/80 rounded-2xl shadow-xl overflow-hidden transition-all duration-200 hover:border-slate-700/80 ${className}`}
    >
      {(title || subtitle || action) && (
        <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between gap-4">
          <div>
            {title && <h3 className="text-base font-semibold text-slate-100">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={`p-6 ${bodyClassName}`}>{children}</div>
      {footer && (
        <div className="px-6 py-3.5 bg-slate-950/40 border-t border-slate-800/60 flex items-center justify-between">
          {footer}
        </div>
      )}
    </div>
  );
};
