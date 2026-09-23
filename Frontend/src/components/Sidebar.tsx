import React, { useState } from 'react';
import { UserRole, USER_ROLES } from '../types';
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Layers,
  Users,
  Calendar,
  FileSpreadsheet,
  FileText,
  Boxes,
  Factory,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Building2,
  TrendingUp,
  Sparkles,
  Zap,
  Truck,
  History,
  BarChart3,
  Package,
  GitFork,
  Share2
} from 'lucide-react';

export type SubViewTab =
  | 'monday_review_cockpit'
  | 'management_loss_report'
  | 'performance_dashboard'
  | 'update_delivery_schedule'
  | 'weekly_fg_matrix'
  | 'weekly_rm_matrix'
  | 'monthly_define_weeks'
  | 'monthly_plan_upload'
  | 'monday_mb51_report'
  | 'monday_stock_report'
  | 'master_bom'
  | 'master_fg_headers'
  | 'master_components'
  | 'master_exploded_bom'
  | 'master_common_components'
  | 'master_vendor_buyer'
  | 'audit_log';

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  currentRole: UserRole;
  onSelectRole: (role: UserRole) => void;
  activeSubView: SubViewTab;
  onSelectSubView: (tab: SubViewTab) => void;
  criticalShortagesCount: number;
  onResetData: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed,
  onToggleCollapse,
  currentRole,
  onSelectRole,
  activeSubView,
  onSelectSubView,
  criticalShortagesCount,
  onResetData
}) => {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    reports: true,
    mrp: true,
    monthly: true,
    monday: true,
    masters: true
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const currentRoleDef = USER_ROLES.find((r) => r.id === currentRole) || USER_ROLES[0];

  return (
    <aside
      className={`bg-slate-950 text-slate-200 border-r border-slate-800 transition-all duration-300 ease-in-out flex flex-col shrink-0 z-30 select-none ${
        isCollapsed ? 'w-16' : 'w-72'
      }`}
    >
      {/* 1. Header & Brand */}
      <div className="p-3.5 border-b border-slate-800 flex items-center justify-between gap-2 bg-slate-950 sticky top-0 z-10">
        {!isCollapsed && (
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shrink-0 font-bold shadow-md shadow-blue-500/20">
              <Layers className="w-4 h-4" />
            </div>
            <div className="truncate">
              <div className="font-bold text-sm text-white tracking-tight flex items-center gap-1.5">
                Weekly MRP & Supply
              </div>
              <div className="text-[10px] text-blue-400 font-mono">SAP S/4HANA Engine</div>
            </div>
          </div>
        )}

        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* 2. Persona Role Switcher */}
      {!isCollapsed && (
        <div className="p-3 border-b border-slate-800/80 bg-slate-900/40">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center justify-between">
            <span>Operating Persona</span>
            <ShieldCheck className="w-3 h-3 text-blue-400" />
          </div>
          <select
            value={currentRole}
            onChange={(e) => onSelectRole(e.target.value as UserRole)}
            className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
          >
            {USER_ROLES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <div className="text-[10px] text-slate-400 mt-1 line-clamp-1">
            {currentRoleDef.description}
          </div>
        </div>
      )}

      {/* 3. Navigation Links */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {/* Section 1: Reports & Executive Dashboards (Dedicated Menu) */}
        <div>
          {!isCollapsed && (
            <button
              onClick={() => toggleSection('reports')}
              className="w-full flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1 hover:text-white"
            >
              <span className="flex items-center gap-1.5 text-rose-400">
                <BarChart3 className="w-3.5 h-3.5" />
                Reports & Dashboards
              </span>
              {expandedSections.reports ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}

          {(isCollapsed || expandedSections.reports) && (
            <div className="mt-1 space-y-1">
              <button
                id="sidebar-btn-management-loss-report"
                onClick={() => onSelectSubView('management_loss_report')}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                  activeSubView === 'management_loss_report'
                    ? 'bg-rose-600 text-white font-semibold shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
                title="Management Report: Critical Items & Weekly Production Loss End-to-End Trace"
              >
                <div className="flex items-center gap-2.5 truncate">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
                  {!isCollapsed && <span className="font-bold text-rose-200">Critical Items Loss Report</span>}
                </div>
                {!isCollapsed && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/40 uppercase">
                    Loss Matrix
                  </span>
                )}
              </button>

              <button
                id="sidebar-btn-performance-dashboard"
                onClick={() => onSelectSubView('performance_dashboard')}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                  activeSubView === 'performance_dashboard'
                    ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
                title="Performance Dashboard (Fulfillment Rates, RM Availability Trends & Stock Accuracy)"
              >
                <div className="flex items-center gap-2.5 truncate">
                  <TrendingUp className="w-4 h-4 shrink-0 text-indigo-400" />
                  {!isCollapsed && <span className="font-semibold">Performance Dashboard</span>}
                </div>
                {!isCollapsed && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 uppercase">
                    KPIs
                  </span>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Section 2: Day-to-Day Operations & Weekly MRP (Operational Transactions) */}
        <div>
          {!isCollapsed && (
            <button
              onClick={() => toggleSection('mrp')}
              className="w-full flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1 hover:text-white"
            >
              <span className="flex items-center gap-1.5 text-blue-400">
                <Layers className="w-3.5 h-3.5" />
                Day-to-Day Operations
              </span>
              {expandedSections.mrp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}

          {(isCollapsed || expandedSections.mrp) && (
            <div className="mt-1 space-y-1">
              <button
                onClick={() => onSelectSubView('monday_review_cockpit')}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                  activeSubView === 'monday_review_cockpit'
                    ? 'bg-blue-600 text-white font-semibold shadow-sm'
                    : 'text-slate-200 hover:text-white hover:bg-slate-800/80 bg-slate-800/40'
                }`}
                title="Monday Review Cockpit (Backlog, Exploded BOM & Delivery Schedules)"
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Zap className="w-4 h-4 shrink-0 text-amber-300" />
                  {!isCollapsed && <span className="font-bold">Monday Review Cockpit</span>}
                </div>
                {!isCollapsed && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-amber-400 text-slate-950 uppercase">
                    Primary
                  </span>
                )}
              </button>

              <button
                onClick={() => onSelectSubView('update_delivery_schedule')}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                  activeSubView === 'update_delivery_schedule'
                    ? 'bg-amber-600 text-white font-semibold shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
                title="Update Delivery Schedule (Excel Upload & Consolidated RM Matrix)"
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Truck className="w-4 h-4 shrink-0 text-amber-400" />
                  {!isCollapsed && <span className="font-semibold">Update Delivery Schedule</span>}
                </div>
                {!isCollapsed && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase">
                    Buyer
                  </span>
                )}
              </button>

              <button
                onClick={() => onSelectSubView('weekly_fg_matrix')}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                  activeSubView === 'weekly_fg_matrix'
                    ? 'bg-blue-600 text-white font-semibold shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
                title="Weekly Finished Goods (FG) Supply Matrix"
              >
                <Factory className="w-4 h-4 shrink-0 text-blue-400" />
                {!isCollapsed && <span>FG Weekly Supply Matrix</span>}
              </button>

              <button
                onClick={() => onSelectSubView('weekly_rm_matrix')}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                  activeSubView === 'weekly_rm_matrix'
                    ? 'bg-blue-600 text-white font-semibold shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
                title="Consolidated RM/PM MRP & Shortages"
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Layers className="w-4 h-4 shrink-0 text-amber-400" />
                  {!isCollapsed && <span className="truncate">RM/PM MRP & Shortages</span>}
                </div>
                {!isCollapsed && criticalShortagesCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-red-600 text-white">
                    {criticalShortagesCount}
                  </span>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Section 2: Monthly Upload */}
        <div>
          {!isCollapsed && (
            <button
              onClick={() => toggleSection('monthly')}
              className="w-full flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1 hover:text-white"
            >
              <span className="flex items-center gap-1.5 text-indigo-400">
                <CalendarRange className="w-3.5 h-3.5" />
                Monthly Upload
              </span>
              {expandedSections.monthly ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}

          {(isCollapsed || expandedSections.monthly) && (
            <div className="mt-1 space-y-1">
              <button
                onClick={() => onSelectSubView('monthly_define_weeks')}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                  activeSubView === 'monthly_define_weeks'
                    ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
                title="Define Week No. (Calendar Buckets & Days Count)"
              >
                <Calendar className="w-4 h-4 shrink-0 text-indigo-400" />
                {!isCollapsed && <span>Define Week No.</span>}
              </button>

              <button
                onClick={() => onSelectSubView('monthly_plan_upload')}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                  activeSubView === 'monthly_plan_upload'
                    ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
                title="Upload Monthly Plan & Auto-Divide by Days"
              >
                <FileSpreadsheet className="w-4 h-4 shrink-0 text-emerald-400" />
                {!isCollapsed && <span>Monthly Plan & Prorating</span>}
              </button>
            </div>
          )}
        </div>

        {/* Section 3: Monday Upload */}
        <div>
          {!isCollapsed && (
            <button
              onClick={() => toggleSection('monday')}
              className="w-full flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1 hover:text-white"
            >
              <span className="flex items-center gap-1.5 text-teal-400">
                <FileText className="w-3.5 h-3.5" />
                Monday Upload
              </span>
              {expandedSections.monday ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}

          {(isCollapsed || expandedSections.monday) && (
            <div className="mt-1 space-y-1">
              <button
                onClick={() => onSelectSubView('monday_mb51_report')}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                  activeSubView === 'monday_mb51_report'
                    ? 'bg-blue-600 text-white font-semibold shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
                title="SAP MB51 Movement Report (101 FG/RM & 601 Dispatches)"
              >
                <FileText className="w-4 h-4 shrink-0 text-blue-400" />
                {!isCollapsed && <span>SAP MB51 Report</span>}
              </button>

              <button
                onClick={() => onSelectSubView('monday_stock_report')}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                  activeSubView === 'monday_stock_report'
                    ? 'bg-teal-600 text-white font-semibold shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
                title="Stock Report (SAP MB52 Unrestricted Balances)"
              >
                <Boxes className="w-4 h-4 shrink-0 text-teal-400" />
                {!isCollapsed && <span>Stock Report (MB52)</span>}
              </button>
            </div>
          )}
        </div>

        {/* Section 4: Master Data (Only BOM Master and Vendor & Buyer Relationship) */}
        <div>
          {!isCollapsed && (
            <button
              onClick={() => toggleSection('masters')}
              className="w-full flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1 hover:text-white"
            >
              <span className="flex items-center gap-1.5 text-amber-400">
                <Building2 className="w-3.5 h-3.5" />
                Master Data
              </span>
              {expandedSections.masters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}

          {(isCollapsed || expandedSections.masters) && (
            <div className="mt-1 space-y-1">
              <button
                onClick={() => onSelectSubView('master_bom')}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                  activeSubView === 'master_bom'
                    ? 'bg-amber-600 text-white font-semibold shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
                title="BOM Master (Finished Goods & Components)"
              >
                <Layers className="w-4 h-4 shrink-0 text-amber-400" />
                {!isCollapsed && <span>1. BOM Master Lines</span>}
              </button>

              <button
                onClick={() => onSelectSubView('master_fg_headers')}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                  activeSubView === 'master_fg_headers'
                    ? 'bg-amber-600 text-white font-semibold shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
                title="Finished Goods Header Master"
              >
                <Boxes className="w-4 h-4 shrink-0 text-amber-400" />
                {!isCollapsed && <span>2. FG Headers (Finished Goods)</span>}
              </button>

              <button
                onClick={() => onSelectSubView('master_components')}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                  activeSubView === 'master_components'
                    ? 'bg-amber-600 text-white font-semibold shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
                title="Raw Materials & Packaging Components Master"
              >
                <Package className="w-4 h-4 shrink-0 text-amber-400" />
                {!isCollapsed && <span>3. RM/PM Component Master</span>}
              </button>

              <button
                onClick={() => onSelectSubView('master_exploded_bom')}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                  activeSubView === 'master_exploded_bom'
                    ? 'bg-amber-600 text-white font-semibold shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
                title="Exploded BOM & Stock Trace"
              >
                <GitFork className="w-4 h-4 shrink-0 text-amber-400" />
                {!isCollapsed && <span>4. Exploded BOM & Stock Trace</span>}
              </button>

              <button
                onClick={() => onSelectSubView('master_common_components')}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                  activeSubView === 'master_common_components'
                    ? 'bg-amber-600 text-white font-semibold shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
                title="Common Components Matrix"
              >
                <Share2 className="w-4 h-4 shrink-0 text-amber-400" />
                {!isCollapsed && <span>5. Common Parts Matrix</span>}
              </button>

              <button
                onClick={() => onSelectSubView('master_vendor_buyer')}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                  activeSubView === 'master_vendor_buyer'
                    ? 'bg-amber-600 text-white font-semibold shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
                title="Vendor and Buyer Relationship Master"
              >
                <Users className="w-4 h-4 shrink-0 text-amber-400" />
                {!isCollapsed && <span>6. Vendor & Buyer Master</span>}
              </button>
            </div>
          )}
        </div>
        
        {/* Section 5: System */}
        <div className="pt-2">
          {!isCollapsed && (
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1">System</div>
          )}
          <button
            onClick={() => onSelectSubView('audit_log')}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
              activeSubView === 'audit_log'
                ? 'bg-slate-600 text-white font-semibold shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
            title="System Audit Log"
          >
            <History className="w-4 h-4 shrink-0 text-slate-400" />
            {!isCollapsed && <span>Audit Log</span>}
          </button>
        </div>
      </div>

      {/* 4. Footer & Reset */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/80">
        <button
          onClick={onResetData}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-400 hover:text-red-400 hover:bg-slate-900 rounded-lg transition-colors"
          title="Reset to initial SAP dataset"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          {!isCollapsed && <span>Reset Demo Data</span>}
        </button>
      </div>
    </aside>
  );
};
