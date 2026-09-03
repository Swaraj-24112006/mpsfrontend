import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  TrendingDown,
  Factory,
  Layers,
  Calendar,
  Truck,
  User,
  Building,
  CheckCircle2,
  Clock,
  DollarSign,
  Download,
  Printer,
  Sliders,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  ArrowRight,
  Sparkles,
  Zap,
  PhoneCall,
  Mail,
  RefreshCw,
  ExternalLink,
  Flame,
  Check,
  Package,
  Info
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import {
  MonthlyPlanItem,
  WeekDefinition,
  BOMItem,
  VendorBuyerItem,
  MB51TransactionItem,
  StockReportItem,
  VendorDeliverySchedule,
  FGPlanFreezeItem,
  ManagementCriticalLossItem,
  ImpactedFGProgram
} from '../../types';
import { computeManagementProductionLossReport } from '../../utils/managementLossEngine';

interface ManagementProductionLossReportProps {
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  weeks: WeekDefinition[];
  monthlyPlans: MonthlyPlanItem[];
  boms: BOMItem[];
  vendorBuyers: VendorBuyerItem[];
  mb51List: MB51TransactionItem[];
  stockList: StockReportItem[];
  vendorDeliverySchedules: VendorDeliverySchedule[];
  planFreezeList: FGPlanFreezeItem[];
  onNavigateToCockpit?: (weekId?: string, fgCode?: string) => void;
  onNavigateToVendorSchedule?: (compCode?: string) => void;
}

export const ManagementProductionLossReport: React.FC<ManagementProductionLossReportProps> = ({
  selectedMonth,
  setSelectedMonth,
  weeks,
  monthlyPlans,
  boms,
  vendorBuyers,
  mb51List,
  stockList,
  vendorDeliverySchedules,
  planFreezeList,
  onNavigateToCockpit,
  onNavigateToVendorSchedule
}) => {
  // 1. Calendar week selection (default to Week 2 if available, else first week)
  const monthWeeks = useMemo(() => {
    return weeks
      .filter((w) => w.month === selectedMonth)
      .sort((a, b) => a.weekNo - b.weekNo);
  }, [weeks, selectedMonth]);

  const [selectedWeekId, setSelectedWeekId] = useState<string>(() => {
    const w2 = monthWeeks.find((w) => w.weekNo === 2);
    return w2 ? w2.id : monthWeeks[0]?.id || '';
  });

  // Ensure selectedWeekId updates if month changes
  React.useEffect(() => {
    if (!monthWeeks.some((w) => w.id === selectedWeekId)) {
      const w2 = monthWeeks.find((w) => w.weekNo === 2);
      setSelectedWeekId(w2 ? w2.id : monthWeeks[0]?.id || '');
    }
  }, [monthWeeks, selectedWeekId]);

  // 2. Executive Management Decision State (persisted in localStorage)
  const [savedDecisions, setSavedDecisions] = useState<
    Record<
      string,
      {
        decisionStatus: ManagementCriticalLossItem['decisionStatus'];
        managementNotes?: string;
        actionOwner?: string;
        targetResolutionDate?: string;
      }
    >
  >(() => {
    const key = `sap_mgmt_decisions_${selectedMonth}`;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  });

  const handleUpdateDecision = (
    compCode: string,
    update: Partial<ManagementCriticalLossItem>
  ) => {
    setSavedDecisions((prev) => {
      const existing = prev[compCode] || {
        decisionStatus: 'PENDING_EXECUTIVE_DECISION'
      };
      const updated = {
        ...existing,
        decisionStatus: update.decisionStatus || existing.decisionStatus,
        managementNotes: update.managementNotes !== undefined ? update.managementNotes : existing.managementNotes,
        actionOwner: update.actionOwner !== undefined ? update.actionOwner : existing.actionOwner,
        targetResolutionDate: update.targetResolutionDate !== undefined ? update.targetResolutionDate : existing.targetResolutionDate
      };
      const next = { ...prev, [compCode]: updated };
      localStorage.setItem(`sap_mgmt_decisions_${selectedMonth}`, JSON.stringify(next));
      return next;
    });
  };

  // 3. Compute Report Output
  const reportData = useMemo(() => {
    return computeManagementProductionLossReport(
      selectedMonth,
      selectedWeekId,
      monthlyPlans,
      weeks,
      boms,
      vendorBuyers,
      mb51List,
      stockList,
      vendorDeliverySchedules,
      planFreezeList,
      savedDecisions
    );
  }, [
    selectedMonth,
    selectedWeekId,
    monthlyPlans,
    weeks,
    boms,
    vendorBuyers,
    mb51List,
    stockList,
    vendorDeliverySchedules,
    planFreezeList,
    savedDecisions
  ]);

  // 4. Filtering & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'SEVEREST' | 'HIGH' | 'NO_PO'>('ALL');
  const [customerFilter, setCustomerFilter] = useState<string>('ALL');
  const [lineFilter, setLineFilter] = useState<string>('ALL');
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [simulationExtraInward, setSimulationExtraInward] = useState<Record<string, number>>({});

  const toggleCard = (id: string) => {
    setExpandedCards((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleAllCards = (expand: boolean) => {
    const next: Record<string, boolean> = {};
    reportData.criticalItems.forEach((item) => {
      next[item.id] = expand;
    });
    setExpandedCards(next);
  };

  // Filtered Critical Items
  const filteredItems = useMemo(() => {
    return reportData.criticalItems.filter((item) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          item.componentCode.toLowerCase().includes(q) ||
          item.componentDescription.toLowerCase().includes(q) ||
          item.vendorName.toLowerCase().includes(q) ||
          item.buyerName.toLowerCase().includes(q) ||
          item.impactedFGs.some(
            (fg) =>
              fg.fgCode.toLowerCase().includes(q) ||
              fg.fgDescription.toLowerCase().includes(q) ||
              fg.customerName.toLowerCase().includes(q)
          );
        if (!match) return false;
      }

      // Severity
      if (severityFilter === 'SEVEREST' && item.criticalityLevel !== 'SEVEREST_IMMEDIATE_STOPPAGE') return false;
      if (severityFilter === 'HIGH' && item.totalProductionLossFGUnits <= 0) return false;
      if (severityFilter === 'NO_PO' && item.deliveryStatusRating !== 'NO_PO_ISSUED') return false;

      // Customer
      if (customerFilter !== 'ALL') {
        const hasCust = item.impactedFGs.some((fg) => fg.customerName === customerFilter);
        if (!hasCust) return false;
      }

      // Line
      if (lineFilter !== 'ALL') {
        const hasLine = item.impactedFGs.some((fg) => fg.line === lineFilter);
        if (!hasLine) return false;
      }

      return true;
    });
  }, [reportData.criticalItems, searchQuery, severityFilter, customerFilter, lineFilter]);

  // Simulator calculation for extra inwards
  const simulatedSummary = useMemo(() => {
    let revisedLossUnits = 0;
    let revisedFinancialLoss = 0;

    reportData.criticalItems.forEach((item) => {
      const extraInward = simulationExtraInward[item.componentCode] || 0;
      const revisedSupply = item.totalAvailableSupply + extraInward;

      item.impactedFGs.forEach((fg) => {
        const revisedBuildable = fg.bomUsageQty > 0 ? Math.floor(revisedSupply / fg.bomUsageQty) : fg.weekGrossTarget;
        const loss = Math.max(0, fg.weekGrossTarget - revisedBuildable);
        revisedLossUnits += loss;
        revisedFinancialLoss += loss * fg.unitPriceINR;
      });
    });

    const savedUnits = Math.max(0, reportData.totalProductionLossFGUnits - revisedLossUnits);
    const savedLossINR = Math.max(0, reportData.totalFinancialLossINR - revisedFinancialLoss);

    return {
      revisedLossUnits,
      revisedFinancialLoss,
      savedUnits,
      savedLossINR
    };
  }, [reportData, simulationExtraInward]);

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      'Component Code',
      'Component Description',
      'Category',
      'Free Stock (MB52)',
      'Scheduled Inward (PO)',
      'Total Supply',
      'Gross Demand',
      'Net Shortfall',
      'Coverage Days',
      'Vendor Code',
      'Vendor Name',
      'Buyer Name',
      'Delivery Status',
      'Impacted FG Code',
      'Impacted FG Description',
      'OEM Customer',
      'Line',
      'Gross Week Target',
      'Max Buildable with Deliveries',
      'Production Loss Units',
      'Revenue Loss (INR)',
      'Stoppage Day & Shift',
      'Root Cause Diagnosis',
      'Management Decision',
      'Action Owner',
      'Target Date'
    ];

    const rows: string[][] = [];

    reportData.criticalItems.forEach((item) => {
      item.impactedFGs.forEach((fg) => {
        rows.push([
          `"${item.componentCode}"`,
          `"${item.componentDescription}"`,
          `"${item.categorySubtype}"`,
          item.availableFreeStock.toString(),
          item.scheduledDeliveriesQty.toString(),
          item.totalAvailableSupply.toString(),
          item.totalGrossRequiredQty.toString(),
          item.netDeficitQty.toString(),
          item.coverageDays.toString(),
          `"${item.vendorCode}"`,
          `"${item.vendorName}"`,
          `"${item.buyerName}"`,
          `"${item.deliveryStatusRating}"`,
          `"${fg.fgCode}"`,
          `"${fg.fgDescription}"`,
          `"${fg.customerName}"`,
          `"${fg.line}"`,
          fg.weekGrossTarget.toString(),
          fg.maxBuildableWithDeliveries.toString(),
          fg.productionLossUnits.toString(),
          fg.financialLossINR.toString(),
          `"${fg.stoppageDayEstimate}"`,
          `"${item.rootCauseDescription.replace(/"/g, '""')}"`,
          `"${item.decisionStatus}"`,
          `"${item.actionOwner || ''}"`,
          `"${item.targetResolutionDate || ''}"`
        ]);
      });
    });

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `Management_Critical_Items_Production_Loss_${selectedMonth}_${reportData.selectedWeek.weekLabel.replace(/\s+/g, '_')}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Chart Data: Production Loss by FG Program
  const fgLossChartData = useMemo(() => {
    const map = new Map<string, { fgName: string; customer: string; planned: number; buildable: number; lost: number }>();
    reportData.criticalItems.forEach((item) => {
      item.impactedFGs.forEach((fg) => {
        const existing = map.get(fg.fgCode) || {
          fgName: fg.fgDescription.split(' ')[0] + ' ' + (fg.fgDescription.split(' ')[1] || ''),
          customer: fg.customerName.split(' ')[0],
          planned: fg.weekGrossTarget,
          buildable: fg.maxBuildableWithDeliveries,
          lost: fg.productionLossUnits
        };
        // keep most constrained buildable
        if (fg.maxBuildableWithDeliveries < existing.buildable) {
          existing.buildable = fg.maxBuildableWithDeliveries;
          existing.lost = Math.max(0, existing.planned - existing.buildable);
        }
        map.set(fg.fgCode, existing);
      });
    });
    return Array.from(map.values());
  }, [reportData]);

  // Chart Data: Financial Loss by Component
  const compLossChartData = useMemo(() => {
    return reportData.criticalItems.map((item) => ({
      name: item.componentCode,
      desc: item.componentDescription,
      lossLakhs: Math.round((item.totalFinancialLossINR / 100000) * 10) / 10,
      lostUnits: item.totalProductionLossFGUnits
    }));
  }, [reportData]);

  return (
    <div className="space-y-6 pb-16">
      {/* 1. EXECUTIVE HEADER BANNER (Bright Theme) */}
      <div className="bg-gradient-to-r from-rose-50/90 via-white to-amber-50/50 border border-rose-200 rounded-xl p-5 shadow-sm relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-96 bg-gradient-to-l from-rose-100/40 to-transparent pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-1 rounded bg-rose-100 text-rose-800 border border-rose-300 text-[11px] font-bold tracking-wider uppercase flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                Executive Management Briefing
              </span>
              <span className="text-xs text-slate-500 font-mono font-medium">
                Plant Operations • S/4HANA Supply Engine
              </span>
            </div>

            <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1.5 flex items-center gap-2">
              Critical Items & Production Loss Matrix
            </h1>
            <p className="text-sm text-slate-600 mt-1 max-w-3xl">
              End-to-end component trace linking Raw Material deficits to Assembly Line starvation, Finished Goods loss, and OEM customer delivery exposure for the selected week.
            </p>
          </div>

          {/* Month & Week Selectors + Actions */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Month Selector */}
            <div className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs shadow-xs">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <span className="text-slate-500 font-medium">Month:</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-slate-900 font-bold focus:outline-none cursor-pointer"
              >
                <option value="2026-08">Aug 2026</option>
                <option value="2026-09">Sep 2026</option>
              </select>
            </div>

            {/* Week Selector */}
            <div className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs shadow-xs">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-slate-500 font-medium">Week:</span>
              <select
                value={selectedWeekId}
                onChange={(e) => setSelectedWeekId(e.target.value)}
                className="bg-transparent text-slate-900 font-bold focus:outline-none cursor-pointer"
              >
                {monthWeeks.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.weekLabel} ({w.workingDays} days)
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Actions */}
            <button
              onClick={() => setIsSimulatorOpen(!isSimulatorOpen)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition border shadow-xs ${
                isSimulatorOpen
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-sm'
                  : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-50'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-600" />
              {isSimulatorOpen ? 'Close What-If Simulator' : 'What-If Simulator'}
            </button>

            <button
              onClick={handleExportCSV}
              className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
              title="Download detailed Excel/CSV export for executive review"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>

            <button
              onClick={() => window.print()}
              className="p-2 rounded-lg bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-300 transition shadow-xs"
              title="Print Executive Presentation Brief"
            >
              <Printer className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. EXECUTIVE LOSS EXPOSURE KPIS (Bright Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* KPI 1: Production Loss */}
        <div className="bg-white border-2 border-rose-200 rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-100/60 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-rose-700 mb-1">
            <span>Production Loss</span>
            <TrendingDown className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-rose-700 font-mono">
            {reportData.totalProductionLossFGUnits.toLocaleString()}
            <span className="text-xs font-medium text-slate-500 ml-1.5">Units</span>
          </div>
          <div className="text-[11px] text-slate-600 mt-1 flex items-center gap-1">
            <span className="text-rose-700 font-semibold">Unbuildable volume</span> this week across assembly lines
          </div>
        </div>

        {/* KPI 2: Financial Exposure */}
        <div className="bg-white border-2 border-amber-200 rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-100/60 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-amber-800 mb-1">
            <span>Financial Loss at Risk</span>
            <DollarSign className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-700 font-mono">
            ₹ {(reportData.totalFinancialLossINR / 100000).toFixed(2)}
            <span className="text-xs font-medium text-slate-500 ml-1.5">Lakhs</span>
          </div>
          <div className="text-[11px] text-slate-600 mt-1">
            Finished Goods revenue at risk from OEM line starvation
          </div>
        </div>

        {/* KPI 3: Critical Bottlenecks */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
            <span>Critical Bottlenecks</span>
            <AlertTriangle className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">
            {reportData.criticalItems.length}
            <span className="text-xs font-medium text-slate-500 ml-1.5">Components</span>
          </div>
          <div className="text-[11px] text-slate-600 mt-1">
            Out of {reportData.allTrackedComponentsCount} active BOM components in production
          </div>
        </div>

        {/* KPI 4: Operating Shifts at Risk */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
            <span>Line Stoppage Risk</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">
            {reportData.totalShiftsAtRisk}
            <span className="text-xs font-medium text-slate-500 ml-1.5">Shifts</span>
          </div>
          <div className="text-[11px] text-slate-600 mt-1">
            ~{reportData.totalShiftsAtRisk * 8} assembly hours across {reportData.impactedAssemblyLines.length} production lines
          </div>
        </div>

        {/* KPI 5: Recoverable with Action */}
        <div className="bg-white border-2 border-emerald-200 rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-100/60 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-emerald-800 mb-1">
            <span>Recoverable via Action</span>
            <Sparkles className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700 font-mono">
            {reportData.totalRecoverableUnitsWithAction.toLocaleString()}
            <span className="text-xs font-medium text-slate-500 ml-1.5">FGs</span>
          </div>
          <div className="text-[11px] text-slate-600 mt-1">
            ₹ {(reportData.totalRecoverableValueINR / 100000).toFixed(2)} L saved with emergency expediting
          </div>
        </div>
      </div>

      {/* 3. WHAT-IF LOSS MITIGATION SIMULATOR (Bright Panel) */}
      {isSimulatorOpen && (
        <div className="bg-amber-50/90 border-2 border-amber-300 rounded-xl p-5 shadow-md space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-amber-200 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-200/80 text-amber-800 flex items-center justify-center font-bold">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  Executive "What-If" Supply Expediting Simulator
                </h3>
                <p className="text-xs text-slate-600">
                  Simulate emergency vendor hot-shot arrivals or air freight batches to see immediate production loss and revenue recovery in real-time.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setSimulationExtraInward({})}
                className="text-xs text-amber-800 hover:text-amber-950 font-bold underline flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                Reset Simulator
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {reportData.criticalItems.map((item) => {
              const currentVal = simulationExtraInward[item.componentCode] || 0;
              const maxNeeded = item.netDeficitQty;

              return (
                <div
                  key={item.componentCode}
                  className="bg-white border border-amber-200 rounded-lg p-3.5 space-y-2.5 shadow-xs"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-slate-900 font-mono">{item.componentCode}</div>
                      <div className="text-[11px] text-slate-600 truncate max-w-[180px]">
                        {item.componentDescription}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                      Deficit: -{maxNeeded.toLocaleString()} {item.uom}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-600">Emergency Inward:</span>
                      <span className="font-bold text-amber-700 font-mono">
                        +{currentVal.toLocaleString()} {item.uom}
                      </span>
                    </div>

                    <input
                      type="range"
                      min="0"
                      max={Math.max(1000, maxNeeded * 1.2)}
                      step="50"
                      value={currentVal}
                      onChange={(e) =>
                        setSimulationExtraInward((prev) => ({
                          ...prev,
                          [item.componentCode]: Number(e.target.value)
                        }))
                      }
                      className="w-full accent-amber-600 cursor-pointer"
                    />

                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>0</span>
                      <button
                        onClick={() =>
                          setSimulationExtraInward((prev) => ({
                            ...prev,
                            [item.componentCode]: maxNeeded
                          }))
                        }
                        className="text-amber-700 hover:underline font-bold"
                      >
                        100% Deficit ({maxNeeded.toLocaleString()})
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Simulator Outcomes Banner */}
          <div className="bg-white border border-emerald-300 rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-black">
                ✓
              </div>
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wider font-bold">
                  Simulated Recovery Impact
                </div>
                <div className="text-sm text-slate-800 font-medium">
                  Authorizing simulated expedites recovers{' '}
                  <span className="font-bold text-emerald-700 font-mono">
                    {simulatedSummary.savedUnits.toLocaleString()} FGs
                  </span>{' '}
                  and rescues{' '}
                  <span className="font-bold text-emerald-700 font-mono">
                    ₹ {(simulatedSummary.savedLossINR / 100000).toFixed(2)} Lakhs
                  </span>{' '}
                  in production value!
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <div className="text-right">
                <div className="text-slate-500">Remaining Weekly Loss:</div>
                <div className="font-bold text-rose-700 font-mono">
                  {simulatedSummary.revisedLossUnits.toLocaleString()} Units (₹{' '}
                  {(simulatedSummary.revisedFinancialLoss / 100000).toFixed(2)} L)
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. VISUAL LOSS CHARTS (Bright Theme) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Chart 1: Plan vs Buildable vs Loss by Finished Good */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Factory className="w-4 h-4 text-blue-600" />
                Finished Goods Target vs Buildable Volume (Week {reportData.selectedWeek.weekNo})
              </h3>
              <p className="text-xs text-slate-500">
                Gross Target (Plan + Prior Backlog) compared with actual buildable ceiling
              </p>
            </div>
          </div>

          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fgLossChartData} margin={{ top: 10, right: 10, left: -15, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.8} />
                <XAxis dataKey="fgName" tick={{ fill: '#475569', fontSize: 11 }} />
                <YAxis tick={{ fill: '#475569', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '8px', color: '#0f172a', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  labelStyle={{ color: '#0f172a', fontWeight: 'bold' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="planned" name="Gross Target" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="buildable" name="Max Buildable" fill="#059669" radius={[4, 4, 0, 0]} />
                <Bar dataKey="lost" name="Production Loss" fill="#e11d48" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Revenue at Risk by Bottleneck Component */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-amber-600" />
                Revenue Loss Exposure by Bottleneck Component (₹ Lakhs)
              </h3>
              <p className="text-xs text-slate-500">
                Financial impact on finished goods output driven by each raw material deficit
              </p>
            </div>
          </div>

          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={compLossChartData}
                layout="vertical"
                margin={{ top: 10, right: 20, left: 35, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.8} />
                <XAxis type="number" tick={{ fill: '#475569', fontSize: 11 }} unit=" L" />
                <YAxis dataKey="name" type="category" tick={{ fill: '#475569', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '8px', color: '#0f172a', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  labelStyle={{ color: '#0f172a', fontWeight: 'bold' }}
                  formatter={(val: number) => [`₹ ${val} Lakhs`, 'Revenue at Risk']}
                />
                <Bar dataKey="lossLakhs" name="Loss (₹ Lakhs)" fill="#d97706" radius={[0, 4, 4, 0]}>
                  {compLossChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? '#dc2626' : '#d97706'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 5. FILTER & SEARCH CONTROL BAR (Bright Theme) */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search component, vendor, buyer, or customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-1.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white"
            />
          </div>

          {/* Severity Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-600 font-semibold">Severity:</span>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as any)}
              className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 font-medium focus:outline-none focus:bg-white"
            >
              <option value="ALL">All Severities</option>
              <option value="SEVEREST">Severest Line Stoppage</option>
              <option value="HIGH">With Production Loss &gt; 0</option>
              <option value="NO_PO">No PO Issued</option>
            </select>
          </div>

          {/* Customer Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-600 font-semibold">OEM Customer:</span>
            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 font-medium focus:outline-none focus:bg-white"
            >
              <option value="ALL">All OEM Clients</option>
              {reportData.impactedOEMCustomers.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Line Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-600 font-semibold">Assembly Line:</span>
            <select
              value={lineFilter}
              onChange={(e) => setLineFilter(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 font-medium focus:outline-none focus:bg-white"
            >
              <option value="ALL">All Lines</option>
              {reportData.impactedAssemblyLines.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Expand / Collapse All */}
        <div className="flex items-center gap-2">
          <span className="text-slate-600 font-mono">
            Showing {filteredItems.length} of {reportData.criticalItems.length} critical items
          </span>
          <button
            onClick={() => toggleAllCards(true)}
            className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold border border-slate-200 transition"
          >
            Expand All
          </button>
          <button
            onClick={() => toggleAllCards(false)}
            className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold border border-slate-200 transition"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* 6. END-TO-END CRITICAL ITEMS CARDS (Bright Theme) */}
      <div className="space-y-4">
        {filteredItems.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">No Critical Bottlenecks Found</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              No components matching your filter criteria are causing production loss for this week. Free stock and vendor delivery promises adequately cover all planned assembly schedules.
            </p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const isExpanded = expandedCards[item.id] ?? true;

            return (
              <div
                key={item.id}
                className={`bg-white rounded-xl border transition-all shadow-sm hover:shadow-md overflow-hidden ${
                  item.criticalityLevel === 'SEVEREST_IMMEDIATE_STOPPAGE'
                    ? 'border-rose-300 hover:border-rose-400'
                    : 'border-amber-300 hover:border-amber-400'
                }`}
              >
                {/* Card Top Banner / Summary Header */}
                <div
                  onClick={() => toggleCard(item.id)}
                  className="p-4 cursor-pointer hover:bg-slate-50/80 transition flex flex-col lg:flex-row lg:items-center justify-between gap-3 select-none bg-white"
                >
                  <div className="flex items-start sm:items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold shrink-0 ${
                        item.criticalityLevel === 'SEVEREST_IMMEDIATE_STOPPAGE'
                          ? 'bg-rose-100 text-rose-700 border border-rose-200'
                          : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}
                    >
                      <AlertTriangle className="w-5 h-5" />
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-slate-900 text-base">
                          {item.componentCode}
                        </span>
                        <span className="text-sm font-semibold text-slate-800">
                          {item.componentDescription}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-semibold uppercase">
                          {item.categorySubtype}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1 font-medium">
                        <span className="flex items-center gap-1 text-slate-700">
                          <Building className="w-3.5 h-3.5 text-blue-600" />
                          Vendor: <strong className="text-slate-900">{item.vendorName}</strong>
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-slate-700">
                          <User className="w-3.5 h-3.5 text-amber-600" />
                          Buyer: <strong className="text-slate-900">{item.buyerName}</strong>
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-rose-700 font-bold">
                          <Clock className="w-3.5 h-3.5" />
                          Worst Stoppage: {item.worstStoppageDay}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right Header Metrics */}
                  <div className="flex items-center gap-4 shrink-0 justify-between lg:justify-end border-t lg:border-t-0 pt-2 lg:pt-0 border-slate-200">
                    <div className="text-left lg:text-right">
                      <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                        Production Loss
                      </div>
                      <div className="text-lg font-black text-rose-700 font-mono">
                        -{item.totalProductionLossFGUnits.toLocaleString()} FGs
                      </div>
                    </div>

                    <div className="text-left lg:text-right">
                      <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                        Value at Risk
                      </div>
                      <div className="text-lg font-black text-amber-700 font-mono">
                        ₹ {(item.totalFinancialLossINR / 100000).toFixed(2)} L
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider ${
                          item.decisionStatus === 'EXPEDITE_APPROVED'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : item.decisionStatus === 'PENDING_EXECUTIVE_DECISION'
                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                            : 'bg-blue-100 text-blue-800 border border-blue-300'
                        }`}
                      >
                        {item.decisionStatus.replace(/_/g, ' ')}
                      </span>

                      <div className="p-1 rounded-lg text-slate-500 hover:text-slate-800">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Expanded Content: 4-Column End-to-End Tracing Grid (Bright Theme) */}
                {isExpanded && (
                  <div className="border-t border-slate-200 bg-slate-50/70 p-5 space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                      {/* Column 1: Supply & Stock Math */}
                      <div className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-2.5 shadow-xs">
                        <div className="text-xs font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-2">
                          <Package className="w-3.5 h-3.5" />
                          1. Stock & Supply Equation
                        </div>

                        <div className="space-y-1.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Physical Stock (MB52):</span>
                            <span className="font-mono text-slate-900 font-semibold">
                              {item.currentPhysicalStock.toLocaleString()} {item.uom}
                            </span>
                          </div>

                          {item.reservedStock > 0 && (
                            <div className="flex justify-between text-amber-800">
                              <span>Reserved for Frozen:</span>
                              <span className="font-mono font-semibold">
                                -{item.reservedStock.toLocaleString()} {item.uom}
                              </span>
                            </div>
                          )}

                          <div className="flex justify-between font-semibold border-t border-slate-200 pt-1">
                            <span className="text-slate-700">Free Available Stock:</span>
                            <span className="font-mono text-slate-900 font-bold">
                              {item.availableFreeStock.toLocaleString()} {item.uom}
                            </span>
                          </div>

                          <div className="flex justify-between text-emerald-700">
                            <span>PO Promised Inward:</span>
                            <span className="font-mono font-semibold">
                              +{item.scheduledDeliveriesQty.toLocaleString()} {item.uom}
                            </span>
                          </div>

                          <div className="flex justify-between font-bold border-t border-slate-200 pt-1 text-slate-800">
                            <span>Total Available Supply:</span>
                            <span className="font-mono">
                              {item.totalAvailableSupply.toLocaleString()} {item.uom}
                            </span>
                          </div>

                          <div className="flex justify-between text-slate-500">
                            <span>Weekly Gross Demand:</span>
                            <span className="font-mono font-semibold text-slate-900">
                              {item.totalGrossRequiredQty.toLocaleString()} {item.uom}
                            </span>
                          </div>

                          <div className="flex justify-between font-black text-sm border-t-2 border-rose-300 pt-1.5 text-rose-700">
                            <span>Net Shortfall / Deficit:</span>
                            <span className="font-mono">
                              -{item.netDeficitQty.toLocaleString()} {item.uom}
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-500 pt-1 flex items-center justify-between">
                            <span>Stock Runout Buffer:</span>
                            <span className="font-bold text-amber-800 font-mono">
                              {item.coverageDays} Days of Production
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Column 2: Procurement & Vendor Accountability */}
                      <div className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-2.5 shadow-xs">
                        <div className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-2">
                          <Truck className="w-3.5 h-3.5" />
                          2. Procurement & Vendor Trace
                        </div>

                        <div className="space-y-2 text-xs">
                          <div>
                            <div className="text-slate-500 text-[11px]">Primary Vendor:</div>
                            <div className="font-bold text-slate-900">
                              {item.vendorName}{' '}
                              <span className="font-mono text-slate-500 font-normal">
                                ({item.vendorCode})
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                              <span>📍 {item.vendorCity}</span> • <span>Lead Time: {item.leadTimeDays}d</span>
                            </div>
                          </div>

                          <div className="border-t border-slate-200 pt-1.5">
                            <div className="text-slate-500 text-[11px]">Category Buyer:</div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <User className="w-3 h-3 text-amber-600" />
                              {item.buyerName}
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                              <span className="flex items-center gap-1 text-blue-700 font-medium">
                                <PhoneCall className="w-3 h-3" /> {item.buyerPhone}
                              </span>
                            </div>
                          </div>

                          <div className="border-t border-slate-200 pt-1.5">
                            <div className="flex items-center justify-between text-[11px] text-slate-600 mb-1">
                              <span>Active PO Delivery Commitments:</span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  item.deliveryStatusRating === 'NO_PO_ISSUED'
                                    ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                    : 'bg-blue-100 text-blue-800 border border-blue-200'
                                }`}
                              >
                                {item.deliveryStatusRating.replace(/_/g, ' ')}
                              </span>
                            </div>

                            {item.activeDeliverySchedules.length === 0 ? (
                              <div className="p-2 rounded bg-rose-50 border border-rose-200 text-[11px] text-rose-800 font-medium">
                                ⚠️ No vendor delivery schedule has been committed in SAP for Week{' '}
                                {reportData.selectedWeek.weekNo}!
                              </div>
                            ) : (
                              <div className="space-y-1">
                                {item.activeDeliverySchedules.map((s) => (
                                  <div
                                    key={s.id}
                                    className="p-1.5 rounded bg-slate-50 border border-slate-200 flex items-center justify-between text-[11px]"
                                  >
                                    <div>
                                      <span className="font-mono font-bold text-slate-900">
                                        {s.poNumber}
                                      </span>
                                      <span className="text-slate-500 ml-1.5">
                                        {s.expectedDeliveryDate.slice(5)}
                                      </span>
                                    </div>
                                    <span className="font-mono font-bold text-emerald-700">
                                      +{s.promisedQty.toLocaleString()} {item.uom}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {onNavigateToVendorSchedule && (
                              <button
                                onClick={() => onNavigateToVendorSchedule(item.componentCode)}
                                className="mt-2 w-full py-1 rounded bg-slate-100 hover:bg-slate-200 text-blue-700 text-[11px] font-semibold flex items-center justify-center gap-1 transition border border-slate-200"
                              >
                                Open Vendor Schedule Manager
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Column 3: Impact on Finished Goods & Production Loss */}
                      <div className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-2.5 shadow-xs">
                        <div className="text-xs font-bold text-rose-700 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-2">
                          <Factory className="w-3.5 h-3.5" />
                          3. Finished Goods & Line Loss
                        </div>

                        <div className="space-y-2 text-xs">
                          {item.impactedFGs.map((fg) => (
                            <div
                              key={fg.fgCode}
                              className="p-2.5 rounded bg-slate-50 border border-slate-200 space-y-1.5"
                            >
                              <div className="flex items-center justify-between">
                                <div className="font-bold text-slate-900 truncate max-w-[150px]">
                                  {fg.fgDescription}
                                </div>
                                <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200 text-[10px] font-semibold">
                                  {fg.line}
                                </span>
                              </div>

                              <div className="text-[11px] text-slate-500 flex items-center justify-between">
                                <span>OEM Client:</span>
                                <strong className="text-slate-900">{fg.customerName}</strong>
                              </div>

                              <div className="text-[11px] text-slate-500 flex items-center justify-between">
                                <span>Gross Week Target:</span>
                                <span className="font-mono text-slate-900 font-semibold">
                                  {fg.weekGrossTarget.toLocaleString()} units
                                </span>
                              </div>

                              <div className="text-[11px] text-slate-500 flex items-center justify-between">
                                <span>Max Buildable (Stock+Deliv):</span>
                                <span className="font-mono text-emerald-700 font-semibold">
                                  {fg.maxBuildableWithDeliveries.toLocaleString()} units
                                </span>
                              </div>

                              <div className="flex items-center justify-between border-t border-slate-200 pt-1 text-rose-700 font-bold">
                                <span>Production Loss:</span>
                                <span className="font-mono">
                                  -{fg.productionLossUnits.toLocaleString()} units
                                </span>
                              </div>

                              <div className="flex items-center justify-between text-amber-800 font-bold text-[11px]">
                                <span>Revenue at Risk:</span>
                                <span className="font-mono">
                                  ₹ {(fg.financialLossINR / 100000).toFixed(2)} L
                                </span>
                              </div>

                              <div className="text-[10px] text-rose-800 bg-rose-50 p-1 rounded border border-rose-200 flex items-center gap-1 font-semibold">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                <span>Line Stoppage: {fg.stoppageDayEstimate}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Column 4: Root Cause & Management Action Center */}
                      <div className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-2.5 shadow-xs flex flex-col justify-between">
                        <div className="space-y-2">
                          <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-2">
                            <Sparkles className="w-3.5 h-3.5" />
                            4. Root Cause & Action Sign-off
                          </div>

                          {/* Root Cause Card */}
                          <div className="p-2.5 rounded bg-slate-50 border border-slate-200 space-y-1">
                            <div className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1">
                              <Info className="w-3 h-3 text-blue-600" />
                              Technical Root Cause:
                            </div>
                            <p className="text-xs text-slate-700 leading-relaxed">
                              {item.rootCauseDescription}
                            </p>
                          </div>

                          {/* Best Recommended Action */}
                          <div className="p-2.5 rounded bg-emerald-50/80 border border-emerald-200 space-y-1">
                            <div className="text-[10px] uppercase font-bold text-emerald-800 flex items-center gap-1">
                              <Zap className="w-3 h-3" />
                              Recommended Intervention:
                            </div>
                            <div className="text-xs font-bold text-slate-900">
                              {item.recommendedActions[0]?.title}
                            </div>
                            <p className="text-[11px] text-slate-700">
                              {item.recommendedActions[0]?.description}
                            </p>
                            <div className="flex items-center justify-between text-[11px] pt-1 border-t border-emerald-200 font-mono">
                              <span className="text-slate-600">
                                Expedite Cost: ₹{item.recommendedActions[0]?.costINR.toLocaleString()}
                              </span>
                              <span className="text-emerald-700 font-bold">
                                Saves: ₹{(item.recommendedActions[0]?.financialValueSavedINR / 100000).toFixed(2)} L
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Executive Decision Form */}
                        <div className="border-t border-slate-200 pt-2 space-y-2">
                          <div className="text-[11px] font-bold text-slate-700">
                            Plant Management Decision:
                          </div>

                          <select
                            value={item.decisionStatus}
                            onChange={(e) =>
                              handleUpdateDecision(item.componentCode, {
                                decisionStatus: e.target.value as any
                              })
                            }
                            className="w-full bg-white border border-slate-300 text-xs rounded px-2 py-1.5 text-slate-900 font-semibold focus:outline-none focus:border-blue-600 shadow-xs"
                          >
                            <option value="PENDING_EXECUTIVE_DECISION">
                              ⏳ Pending Executive Decision
                            </option>
                            <option value="EXPEDITE_APPROVED">
                              ✅ Authorize Dedicated Air Freight / Hot-Shot
                            </option>
                            <option value="STOCK_REALLOCATED">
                              🔄 Reallocate Buffer Stock from Other Line
                            </option>
                            <option value="SECOND_SOURCE_ACTIVATED">
                              ⚡ Activate Fast-Track Second Source
                            </option>
                            <option value="LINE_RESCHEDULED">
                              📅 Reschedule Assembly Line to Shift 3
                            </option>
                          </select>

                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div>
                              <span className="text-slate-500 text-[10px]">Action Owner:</span>
                              <input
                                type="text"
                                value={item.actionOwner || ''}
                                onChange={(e) =>
                                  handleUpdateDecision(item.componentCode, {
                                    actionOwner: e.target.value
                                  })
                                }
                                placeholder="e.g. Rajesh Kumar"
                                className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-slate-900 text-xs focus:outline-none focus:border-blue-600 shadow-xs"
                              />
                            </div>
                            <div>
                              <span className="text-slate-500 text-[10px]">Target Date:</span>
                              <input
                                type="date"
                                value={item.targetResolutionDate || ''}
                                onChange={(e) =>
                                  handleUpdateDecision(item.componentCode, {
                                    targetResolutionDate: e.target.value
                                  })
                                }
                                className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-slate-900 text-xs focus:outline-none focus:border-blue-600 shadow-xs"
                              />
                            </div>
                          </div>

                          <div>
                            <span className="text-slate-500 text-[10px]">Management Directives / Notes:</span>
                            <textarea
                              rows={2}
                              value={item.managementNotes || ''}
                              onChange={(e) =>
                                handleUpdateDecision(item.componentCode, {
                                  managementNotes: e.target.value
                                })
                              }
                              placeholder="Directives for supply chain & buyer..."
                              className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-slate-900 text-xs focus:outline-none focus:border-blue-600 resize-none shadow-xs"
                            />
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-emerald-700 font-semibold pt-0.5">
                            <span className="flex items-center gap-1">
                              <Check className="w-3 h-3" /> Auto-saved in system
                            </span>
                            {onNavigateToCockpit && (
                              <button
                                onClick={() => onNavigateToCockpit(selectedWeekId, item.impactedFGs[0]?.fgCode)}
                                className="text-blue-700 hover:underline flex items-center gap-1"
                              >
                                View in Monday Cockpit →
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 7. EXECUTIVE SUMMARY TABLE (Print / Presentation Friendly - Bright Theme) */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Executive Traceability Matrix: Component Deficit & Production Impact
            </h3>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            Week {reportData.selectedWeek.weekNo} ({reportData.selectedWeek.startDate} to {reportData.selectedWeek.endDate})
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                <th className="p-3">Component / Description</th>
                <th className="p-3 text-right">Free Stock</th>
                <th className="p-3 text-right">Committed Inward</th>
                <th className="p-3 text-right">Gross Req</th>
                <th className="p-3 text-right text-rose-700">Net Deficit</th>
                <th className="p-3">Vendor / Buyer</th>
                <th className="p-3">Impacted Finished Good</th>
                <th className="p-3">OEM Client</th>
                <th className="p-3 text-right text-rose-700">Production Loss</th>
                <th className="p-3 text-right text-amber-800">Loss (₹ Lakhs)</th>
                <th className="p-3">Line Stoppage</th>
                <th className="p-3">Management Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {reportData.criticalItems.map((item) => {
                return item.impactedFGs.map((fg, idx) => (
                  <tr key={`${item.id}-${fg.fgCode}`} className="hover:bg-slate-50/80 transition">
                    {idx === 0 ? (
                      <td className="p-3 font-semibold" rowSpan={item.impactedFGs.length}>
                        <div className="font-mono text-slate-900 font-bold">{item.componentCode}</div>
                        <div className="text-slate-500 text-[11px] line-clamp-1">
                          {item.componentDescription}
                        </div>
                        <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] bg-slate-100 text-slate-600 border border-slate-200">
                          {item.categorySubtype}
                        </span>
                      </td>
                    ) : null}

                    {idx === 0 ? (
                      <td className="p-3 text-right font-mono text-slate-900" rowSpan={item.impactedFGs.length}>
                        {item.availableFreeStock.toLocaleString()}
                      </td>
                    ) : null}

                    {idx === 0 ? (
                      <td className="p-3 text-right font-mono text-emerald-700 font-semibold" rowSpan={item.impactedFGs.length}>
                        +{item.scheduledDeliveriesQty.toLocaleString()}
                      </td>
                    ) : null}

                    {idx === 0 ? (
                      <td className="p-3 text-right font-mono text-slate-800" rowSpan={item.impactedFGs.length}>
                        {item.totalGrossRequiredQty.toLocaleString()}
                      </td>
                    ) : null}

                    {idx === 0 ? (
                      <td className="p-3 text-right font-mono font-bold text-rose-700" rowSpan={item.impactedFGs.length}>
                        -{item.netDeficitQty.toLocaleString()}
                      </td>
                    ) : null}

                    {idx === 0 ? (
                      <td className="p-3" rowSpan={item.impactedFGs.length}>
                        <div className="font-semibold text-slate-900 truncate max-w-[140px]">{item.vendorName}</div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[140px]">{item.buyerName}</div>
                      </td>
                    ) : null}

                    <td className="p-3">
                      <div className="font-semibold text-slate-900 truncate max-w-[160px]">{fg.fgDescription}</div>
                      <div className="text-[11px] font-mono text-slate-500">{fg.fgCode} • {fg.line}</div>
                    </td>

                    <td className="p-3 font-semibold text-slate-700">
                      {fg.customerName}
                    </td>

                    <td className="p-3 text-right font-mono font-bold text-rose-700">
                      -{fg.productionLossUnits.toLocaleString()} FGs
                    </td>

                    <td className="p-3 text-right font-mono font-bold text-amber-800">
                      ₹ {(fg.financialLossINR / 100000).toFixed(2)} L
                    </td>

                    <td className="p-3 text-rose-700 font-semibold text-[11px]">
                      {fg.stoppageDayEstimate}
                    </td>

                    {idx === 0 ? (
                      <td className="p-3" rowSpan={item.impactedFGs.length}>
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            item.decisionStatus === 'EXPEDITE_APPROVED'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : item.decisionStatus === 'PENDING_EXECUTIVE_DECISION'
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : 'bg-blue-100 text-blue-800 border border-blue-300'
                          }`}
                        >
                          {item.decisionStatus.replace(/_/g, ' ')}
                        </span>
                      </td>
                    ) : null}
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
