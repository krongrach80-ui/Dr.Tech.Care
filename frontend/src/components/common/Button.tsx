import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost' | 'success';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  disabled,
  className = '',
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98]';

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs gap-1.5 shadow-sm',
    md: 'px-4 py-2 text-sm gap-2 shadow',
    lg: 'px-6 py-3 text-base gap-2.5 shadow-md',
  };

  const variantStyles = {
    primary: 'bg-emerald-600 hover:bg-emerald-500 text-white focus:ring-emerald-500 shadow-emerald-500/20 hover:shadow-emerald-500/30 border border-emerald-500/30',
    secondary: 'bg-slate-800 hover:bg-slate-700 text-slate-100 focus:ring-slate-500 border border-slate-700/60 shadow-slate-900/20',
    success: 'bg-teal-600 hover:bg-teal-500 text-white focus:ring-teal-500 shadow-teal-500/20 border border-teal-500/30',
    danger: 'bg-rose-600 hover:bg-rose-500 text-white focus:ring-rose-500 shadow-rose-500/20 border border-rose-500/30',
    outline: 'bg-transparent hover:bg-slate-800/60 text-slate-200 border border-slate-700 focus:ring-slate-500',
    ghost: 'bg-transparent hover:bg-slate-800/40 text-slate-300 hover:text-white focus:ring-slate-500',
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      ) : (
        leftIcon && <span className="shrink-0">{leftIcon}</span>
      )}
      <span>{children}</span>
      {!isLoading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
    </button>
  );
};
