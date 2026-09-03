import React from 'react';
import { UserRole, USER_ROLES } from '../types';
import {
  Menu,
  ShieldCheck,
  Layers,
  AlertTriangle,
  RotateCcw,
  Calendar,
  Factory
} from 'lucide-react';

interface HeaderProps {
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onResetData: () => void;
  criticalShortageCount: number;
  activeViewTitle?: string;
}

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  setCurrentRole,
  selectedMonth,
  setSelectedMonth,
  isSidebarCollapsed,
  onToggleSidebar,
  onResetData,
  criticalShortageCount,
  activeViewTitle = 'Weekly MRP & Supply Operations'
}) => {
  const currentRoleDef = USER_ROLES.find((r) => r.id === currentRole) || USER_ROLES[0];

  return (
    <header className="bg-slate-950 text-slate-100 border-b border-slate-800 sticky top-0 z-20 shadow-sm">
      <div className="px-4 py-2.5 flex items-center justify-between gap-3">
        {/* Left: Sidebar Toggle + Active View Title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onToggleSidebar}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer shrink-0"
            title="Toggle Sidebar"
          >
            <Menu className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 px-3 py-1 rounded-lg border border-blue-500/30 bg-blue-950/40 text-blue-200 text-xs font-bold truncate">
            <Layers className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="truncate">{activeViewTitle}</span>
          </div>
        </div>

        {/* Right: Quick Indicators & Controls */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Critical Shortages Badges */}
          {criticalShortageCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-950/70 border border-red-800 text-red-300 rounded-lg text-xs font-mono font-bold">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
              {criticalShortageCount} RM/PM Deficits
            </div>
          )}

          {/* Month Selector */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 px-2.5 py-1 rounded-lg text-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400 hidden sm:inline text-[11px]">Month:</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent border-none text-white text-xs font-mono font-bold focus:outline-none cursor-pointer"
            />
          </div>

          {/* Role selector */}
          <div className="hidden sm:flex items-center gap-1.5 bg-slate-900 border border-slate-700 px-2.5 py-1 rounded-lg text-xs">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
            <select
              value={currentRole}
              onChange={(e) => setCurrentRole(e.target.value as UserRole)}
              className="bg-transparent border-none text-white text-xs font-semibold focus:outline-none cursor-pointer"
            >
              {USER_ROLES.map((role) => (
                <option key={role.id} value={role.id} className="bg-slate-900 text-white">
                  {role.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </header>
  );
};
