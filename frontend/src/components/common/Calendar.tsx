import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

export interface CalendarEventDay {
  date: string; // YYYY-MM-DD
  status: 'completed' | 'scheduled' | 'missed';
  label?: string;
}

export interface CalendarProps {
  events?: Record<string, 'completed' | 'scheduled' | 'missed'>;
  selectedDate?: string;
  onSelectDate?: (dateStr: string) => void;
  className?: string;
}

export const Calendar: React.FC<CalendarProps> = ({
  events = {},
  selectedDate,
  onSelectDate,
  className = '',
}) => {
  const [currentDate, setCurrentDate] = useState(() => new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNamesTh = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];

  const daysOfWeekTh = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  // Generate calendar cells
  const cells: Array<{
    dateStr: string;
    dayNum: number;
    isCurrentMonth: boolean;
    isToday: boolean;
    status?: 'completed' | 'scheduled' | 'missed';
  }> = [];

  // Previous month trailing days
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const m = month === 0 ? 12 : month;
    const y = month === 0 ? year - 1 : year;
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({
      dateStr,
      dayNum: d,
      isCurrentMonth: false,
      isToday: false,
      status: events[dateStr],
    });
  }

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({
      dateStr,
      dayNum: d,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
      status: events[dateStr],
    });
  }

  // Next month leading days to complete grid (42 cells: 6 rows)
  const remainingCells = 42 - cells.length;
  for (let d = 1; d <= remainingCells; d++) {
    const m = month === 11 ? 1 : month + 2;
    const y = month === 11 ? year + 1 : year;
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({
      dateStr,
      dayNum: d,
      isCurrentMonth: false,
      isToday: false,
      status: events[dateStr],
    });
  }

  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl ${className}`}>
      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-base font-bold text-white">
            {monthNamesTh[month]} {year + 543}
          </h4>
          <p className="text-xs text-slate-400">
            {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={handlePrevMonth} aria-label="Previous month">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleNextMonth} aria-label="Next month">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-slate-400 mb-4 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
          <span>สำเร็จแล้ว (Completed)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-sky-500 shadow-sm shadow-sky-500/50" />
          <span>มีนัดหมาย (Scheduled)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50" />
          <span>เลื่อน/ขาดฝึก (Missed)</span>
        </div>
      </div>

      {/* Day of Week Headers */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-400 mb-2">
        {daysOfWeekTh.map((day, idx) => (
          <div key={idx} className="py-1">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, idx) => {
          const isSelected = selectedDate === cell.dateStr;

          return (
            <button
              key={idx}
              onClick={() => onSelectDate && onSelectDate(cell.dateStr)}
              className={`h-11 rounded-xl flex flex-col items-center justify-center relative transition-all duration-150 select-none ${
                isSelected
                  ? 'bg-emerald-600/30 border-2 border-emerald-500 text-white font-bold'
                  : cell.isCurrentMonth
                  ? 'text-slate-200 hover:bg-slate-800/80'
                  : 'text-slate-600 hover:bg-slate-800/30'
              } ${cell.isToday && !isSelected ? 'border border-cyan-500/60 font-semibold' : ''}`}
            >
              <span className="text-xs">{cell.dayNum}</span>

              {/* Status Dot */}
              {cell.status && (
                <div className="mt-0.5 flex gap-0.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      cell.status === 'completed'
                        ? 'bg-emerald-400 ring-2 ring-emerald-400/20'
                        : cell.status === 'scheduled'
                        ? 'bg-sky-400 ring-2 ring-sky-400/20'
                        : 'bg-rose-400 ring-2 ring-rose-400/20'
                    }`}
                  />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
