import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Upload,
  Plus,
  Download,
  Calendar,
  Layers,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  SlidersHorizontal,
  Info
} from 'lucide-react';
import { MonthlyPlanItem, WeekDefinition, BOMItem } from '../../types';
import { calculateProratedWeeklyBreakdown } from '../../data/sapInitialData';

interface MonthlyPlanManagerProps {
  monthlyPlans: MonthlyPlanItem[];
  onUpdateMonthlyPlans: (plans: MonthlyPlanItem[]) => void;
  weeks: WeekDefinition[];
  boms: BOMItem[];
  selectedMonth: string;
  onSelectMonth: (month: string) => void;
}

export const MonthlyPlanManager: React.FC<MonthlyPlanManagerProps> = ({
  monthlyPlans,
  onUpdateMonthlyPlans,
  weeks,
  boms,
  selectedMonth,
  onSelectMonth
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<MonthlyPlanItem | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<MonthlyPlanItem>>({
    fgCode: '',
    fgDescription: '',
    customerName: '',
    monthlyTarget: 5000,
    uom: 'PC',
    customNotes: ''
  });

  const [csvInput, setCsvInput] = useState('');

  // Active weeks for this month
  const monthWeeks = weeks
    .filter((w) => w.month === selectedMonth)
    .sort((a, b) => a.weekNo - b.weekNo);

  const totalMonthDays = monthWeeks.reduce((sum, w) => sum + w.daysCount, 0);

  // Unique FGs from BOM
  const fgOptions: { code: string; desc: string }[] = Array.from(
    new Map<string, { code: string; desc: string }>(
      boms.map((b) => [b.fgCode, { code: b.fgCode, desc: b.fgDescription }])
    ).values()
  );

  const currentMonthPlans = monthlyPlans.filter((p) => p.month === selectedMonth);

  const filteredPlans = currentMonthPlans.filter((p) => {
    return (
      p.fgCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.fgDescription.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.customerName || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  // Calculate totals
  const totalMonthlyDemand = filteredPlans.reduce((sum, p) => sum + p.monthlyTarget, 0);
  const weeklyConsolidatedTotals: Record<string, number> = {};
  monthWeeks.forEach((w) => {
    weeklyConsolidatedTotals[w.id] = filteredPlans.reduce(
      (sum, p) => sum + (p.weeklyBreakdown[w.id] || 0),
      0
    );
  });

  const handleOpenAddModal = (existing?: MonthlyPlanItem) => {
    if (existing) {
      setEditingPlan(existing);
      setFormData(existing);
    } else {
      setEditingPlan(null);
      const firstFG = fgOptions[0] || { code: '7.06496.03.0', desc: 'Vacuum Pump Panther 2.0L' };
      setFormData({
        fgCode: firstFG.code,
        fgDescription: firstFG.desc,
        customerName: '',
        monthlyTarget: 5000,
        uom: 'PC',
        customNotes: ''
      });
    }
    setIsAddModalOpen(true);
  };

  const handleFGSelectChange = (code: string) => {
    const found = fgOptions.find((f) => f.code === code);
    setFormData({
      ...formData,
      fgCode: code,
      fgDescription: found ? found.desc : formData.fgDescription
    });
  };

  const handleSavePlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fgCode || !formData.monthlyTarget) {
      alert('Please select FG code and enter monthly target.');
      return;
    }

    const targetQty = Number(formData.monthlyTarget) || 0;
    const weeklyBreakdown = calculateProratedWeeklyBreakdown(targetQty, monthWeeks);

    if (editingPlan) {
      const updated = monthlyPlans.map((p) =>
        p.id === editingPlan.id
          ? ({
              ...p,
              ...formData,
              monthlyTarget: targetQty,
              weeklyBreakdown
            } as MonthlyPlanItem)
          : p
      );
      onUpdateMonthlyPlans(updated);
    } else {
      const newPlan: MonthlyPlanItem = {
        id: `mp-${Date.now()}`,
        fgCode: formData.fgCode,
        fgDescription: formData.fgDescription || 'Finished Good',
        customerName: formData.customerName || 'OEM Customer',
        month: selectedMonth,
        monthlyTarget: targetQty,
        uom: formData.uom || 'PC',
        weeklyBreakdown,
        customNotes: formData.customNotes || ''
      };
      onUpdateMonthlyPlans([...monthlyPlans, newPlan]);
    }
    setIsAddModalOpen(false);
  };

  const handleRecalculateAllProrated = () => {
    if (monthWeeks.length === 0) {
      alert('Please define weeks for this month first under "Define Week No."');
      return;
    }
    const updated = monthlyPlans.map((p) => {
      if (p.month === selectedMonth) {
        return {
          ...p,
          weeklyBreakdown: calculateProratedWeeklyBreakdown(p.monthlyTarget, monthWeeks)
        };
      }
      return p;
    });
    onUpdateMonthlyPlans(updated);
  };

  const handleDeletePlan = (id: string) => {
    if (window.confirm('Delete this FG monthly plan?')) {
      onUpdateMonthlyPlans(monthlyPlans.filter((p) => p.id !== id));
    }
  };

  const handleCSVUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvInput.trim()) {
      alert('Please paste CSV or tab-separated data');
      return;
    }

    const lines = csvInput.trim().split('\n');
    const parsed: MonthlyPlanItem[] = [];

    // Parse each line (FG Code, Customer, Monthly Target)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      // Skip header if contains 'fg' or 'code' or 'target'
      if (i === 0 && (line.toLowerCase().includes('code') || line.toLowerCase().includes('target'))) {
        continue;
      }

      // Supports comma or tab separation
      const delimiter = line.includes('\t') ? '\t' : ',';
      const parts = line.split(delimiter).map((s) => s.replace(/^"|"$/g, '').trim());

      if (parts.length >= 3) {
        const fgCode = parts[0];
        const customer = parts[1];
        const target = parseFloat(parts[2].replace(/,/g, '')) || 0;

        if (fgCode && target > 0) {
          // Auto-lookup description and uom
          const bomMatch = boms.find(b => b.fgCode === fgCode);
          
          parsed.push({
            id: `mp-${Date.now()}-${i}`,
            fgCode,
            fgDescription: bomMatch ? bomMatch.fgDescription : `Product ${fgCode}`,
            customerName: customer,
            month: selectedMonth,
            monthlyTarget: target,
            uom: bomMatch ? bomMatch.uom : 'PC',
            weeklyBreakdown: calculateProratedWeeklyBreakdown(target, monthWeeks)
          });
        }
      }
    }

    if (parsed.length === 0) {
      alert('No valid records found. Format: FG Code, FG Description, Customer Name, Monthly Target');
      return;
    }

    // Merge or replace for this month
    const otherMonthPlans = monthlyPlans.filter((p) => p.month !== selectedMonth);
    onUpdateMonthlyPlans([...otherMonthPlans, ...parsed]);
    setIsUploadModalOpen(false);
    setCsvInput('');
  };

  const handleExportCSV = () => {
    const headers = [
      'FG Code',
      'FG Description',
      'Customer Name',
      'Month',
      'Monthly Target',
      ...monthWeeks.map((w) => `${w.weekLabel} (${w.daysCount}d)`),
      'UOM'
    ];

    const rows = filteredPlans.map((p) => [
      `"${p.fgCode}"`,
      `"${p.fgDescription}"`,
      `"${p.customerName || ''}"`,
      `"${p.month}"`,
      p.monthlyTarget,
      ...monthWeeks.map((w) => p.weeklyBreakdown[w.id] || 0),
      `"${p.uom}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Monthly_Plan_Weekly_Consolidation_${selectedMonth}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Upload Monthly Plan & Weekly Distribution</h1>
            <p className="text-sm text-slate-500">
              Uploads monthly customer FG plan and auto-divides quantities based on the number of days in each defined week
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleRecalculateAllProrated}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-slate-50 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
            title="Recalculate weekly breakdown based on active week definitions"
          >
            <RefreshCw className="w-4 h-4 text-slate-500" />
            Recalculate Weeks
          </button>
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
          >
            <Upload className="w-4 h-4 text-emerald-600" />
            Upload Plan CSV / Excel
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-slate-50 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <Download className="w-4 h-4 text-slate-500" />
            Export CSV
          </button>
          <button
            onClick={() => handleOpenAddModal()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add FG Plan
          </button>
        </div>
      </div>

      {/* Month & Calendar Days Notification Banner */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <label className="text-sm font-bold text-slate-700 flex items-center gap-1.5 whitespace-nowrap">
            <Calendar className="w-4 h-4 text-emerald-600" />
            Planning Month:
          </label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => onSelectMonth(e.target.value)}
            className="px-3.5 py-2 text-sm font-bold border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500 font-mono"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
          <span className="text-slate-500">Active Week Weights ({totalMonthDays} Total Days):</span>
          {monthWeeks.map((w) => (
            <span
              key={w.id}
              className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-800 font-mono shadow-xs"
            >
              <strong className="text-emerald-700">{w.weekLabel}</strong>: {w.daysCount}d ({Math.round((w.daysCount / (totalMonthDays || 1)) * 100)}%)
            </span>
          ))}
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Monthly FG Plan Volume</div>
          <div className="text-2xl font-bold text-slate-900 mt-1 font-mono">
            {totalMonthlyDemand.toLocaleString()} <span className="text-xs text-slate-500 font-normal">Units</span>
          </div>
          <div className="text-xs text-emerald-700 font-semibold mt-1">
            Across {filteredPlans.length} Finished Good variants
          </div>
        </div>

        {monthWeeks.slice(0, 3).map((w) => (
          <div key={w.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-xs text-slate-500 font-medium">{w.weekLabel} ({w.daysCount} Days)</div>
            <div className="text-2xl font-bold text-slate-900 mt-1 font-mono">
              {(weeklyConsolidatedTotals[w.id] || 0).toLocaleString()} <span className="text-xs text-slate-500 font-normal">Units</span>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Consolidated weekly requirement
            </div>
          </div>
        ))}
      </div>

      {/* Main Consolidated Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-900 text-sm">
              Monthly FG Plan vs Prorated Weekly Consolidated Requirements
            </h2>
            <p className="text-xs text-slate-500">
              Each row displays the monthly target and its automatic proportional distribution across weeks by days count
            </p>
          </div>

          <div className="relative min-w-[240px]">
            <input
              type="text"
              placeholder="Search FG code, name, customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-3 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider font-semibold">
                <th className="py-3.5 px-4">Finished Good (Part No)</th>
                <th className="py-3.5 px-4">Customer / OEM</th>
                <th className="py-3.5 px-4 text-right bg-emerald-50/50 text-emerald-950 font-bold">
                  Monthly Target
                </th>
                {monthWeeks.map((w) => (
                  <th key={w.id} className="py-3.5 px-4 text-right font-bold text-slate-700">
                    <div>{w.weekLabel}</div>
                    <div className="text-[10px] text-slate-400 font-normal lowercase">
                      {w.daysCount} days weight
                    </div>
                  </th>
                ))}
                <th className="py-3.5 px-4 text-center">UOM</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredPlans.length === 0 ? (
                <tr>
                  <td colSpan={5 + monthWeeks.length} className="py-8 text-center text-slate-400">
                    No monthly plans for {selectedMonth}. Click "Add FG Plan" or "Upload Plan CSV".
                  </td>
                </tr>
              ) : (
                filteredPlans.map((plan) => (
                  <tr key={plan.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 font-mono text-xs flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200">
                          {plan.fgCode}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{plan.fgDescription}</div>
                    </td>
                    <td className="py-3 px-4 text-xs font-semibold text-slate-700">
                      {plan.customerName || 'Standard Production'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-800 bg-emerald-50/30">
                      {plan.monthlyTarget.toLocaleString()}
                    </td>
                    {monthWeeks.map((w) => (
                      <td key={w.id} className="py-3 px-4 text-right font-mono text-slate-800 font-semibold">
                        {(plan.weeklyBreakdown[w.id] || 0).toLocaleString()}
                      </td>
                    ))}
                    <td className="py-3 px-4 text-center text-xs font-medium text-slate-500">
                      {plan.uom}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenAddModal(plan)}
                          className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                          title="Edit plan"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeletePlan(plan.id)}
                          className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Delete plan"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filteredPlans.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-900">
                  <td className="py-3.5 px-4" colSpan={2}>
                    Total Consolidated Requirement
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-emerald-800 bg-emerald-100/50">
                    {totalMonthlyDemand.toLocaleString()}
                  </td>
                  {monthWeeks.map((w) => (
                    <td key={w.id} className="py-3.5 px-4 text-right font-mono text-slate-900">
                      {(weeklyConsolidatedTotals[w.id] || 0).toLocaleString()}
                    </td>
                  ))}
                  <td className="py-3.5 px-4 text-center text-xs text-slate-500">PC</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Add / Edit FG Plan Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              {editingPlan ? 'Edit Finished Good Plan' : 'Add Monthly FG Plan'}
            </h2>

            <form onSubmit={handleSavePlan} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Finished Good (FG Part Number) *
                </label>
                <select
                  value={formData.fgCode || ''}
                  onChange={(e) => handleFGSelectChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white font-mono"
                >
                  {fgOptions.map((fg) => (
                    <option key={fg.code} value={fg.code}>
                      {fg.code} - {fg.desc}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  FG Description
                </label>
                <input
                  type="text"
                  value={formData.fgDescription || ''}
                  onChange={(e) => setFormData({ ...formData, fgDescription: e.target.value })}
                  placeholder="e.g. Vacuum Pump Panther 2.0L"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Customer / OEM Program
                  </label>
                  <input
                    type="text"
                    value={formData.customerName || ''}
                    onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                    placeholder="e.g. Tata Motors PV"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Total Monthly Target Qty *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.monthlyTarget ?? 5000}
                    onChange={(e) =>
                      setFormData({ ...formData, monthlyTarget: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 font-mono font-bold"
                  />
                </div>
              </div>

              {/* Live Preview of Weekly Prorated calculation */}
              {formData.monthlyTarget && formData.monthlyTarget > 0 && (
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1">
                    <Info className="w-3.5 h-3.5 text-emerald-600" />
                    Auto-Prorated Weekly Quantities ({totalMonthDays} Days Total):
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    {monthWeeks.map((w, idx) => {
                      const computed = calculateProratedWeeklyBreakdown(
                        Number(formData.monthlyTarget) || 0,
                        monthWeeks
                      )[w.id];
                      return (
                        <div key={w.id} className="bg-white p-2 rounded border border-slate-200">
                          <div className="text-slate-500 text-[11px]">W{w.weekNo} ({w.daysCount}d)</div>
                          <div className="font-bold text-slate-900 font-mono mt-0.5">
                            {computed?.toLocaleString()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors"
                >
                  {editingPlan ? 'Save Changes' : 'Add Monthly Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload CSV Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-xl w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <h2 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
              <Upload className="w-5 h-5 text-emerald-600" />
              Upload Monthly Plan (CSV / Excel Paste)
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Paste your spreadsheet rows below. The system will automatically calculate the prorated weekly numbers based on the days in each week for {selectedMonth}.
            </p>

            <form onSubmit={handleCSVUpload} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  CSV or Tab-Separated Data
                </label>
                <textarea
                  rows={8}
                  required
                  value={csvInput}
                  onChange={(e) => setCsvInput(e.target.value)}
                  placeholder={`FG Code,FG Description,Customer,Monthly Target\n7.06496.03.0,Vacuum Pump Panther 2.0L,Tata Motors,10000\n7.09629.01.0,FAM B Tandem Vacuum Pump,Mahindra Auto,8000\n7.02551.11.0,Variable Flow Oil Pump,Hyundai India,6200`}
                  className="w-full p-3 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
                <span className="font-semibold">Expected Columns:</span> FG Code, Customer Name, Monthly Target Qty.
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors"
                >
                  Import & Prorate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
