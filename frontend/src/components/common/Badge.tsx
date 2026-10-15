import React from 'react';

export interface BadgeProps {
  children?: React.ReactNode;
  variant?: 'admin' | 'pt' | 'patient' | 'active' | 'disabled' | 'covering' | 'completed' | 'scheduled' | 'missed' | 'suspicious' | 'minigame' | 'pose' | 'neutral';
  size?: 'sm' | 'md';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'md',
  className = '',
}) => {
  const sizeStyles = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs font-semibold',
  };

  const variantStyles = {
    admin: 'bg-purple-950/70 text-purple-300 border border-purple-700/50 shadow-sm shadow-purple-900/30',
    pt: 'bg-teal-950/70 text-teal-300 border border-teal-700/50 shadow-sm shadow-teal-900/30',
    patient: 'bg-sky-950/70 text-sky-300 border border-sky-700/50 shadow-sm shadow-sky-900/30',
    active: 'bg-emerald-950/70 text-emerald-300 border border-emerald-700/50',
    disabled: 'bg-slate-800 text-slate-400 border border-slate-700',
    covering: 'bg-amber-950/70 text-amber-300 border border-amber-600/60 animate-pulse',
    completed: 'bg-emerald-950/80 text-emerald-300 border border-emerald-600/60',
    scheduled: 'bg-blue-950/80 text-blue-300 border border-blue-600/60',
    missed: 'bg-rose-950/80 text-rose-300 border border-rose-600/60',
    suspicious: 'bg-rose-950/90 text-rose-300 border border-rose-500 font-bold',
    minigame: 'bg-indigo-950/80 text-indigo-300 border border-indigo-700/50',
    pose: 'bg-slate-800 text-slate-400 border border-slate-600/40',
    neutral: 'bg-slate-800/80 text-slate-300 border border-slate-700',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium tracking-wide uppercase ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {children}
    </span>
  );
};
