import React, { useState, useMemo } from 'react';
import {
  VendorDeliverySchedule,
  VendorBuyerItem,
  BOMItem,
  MonthlyPlanItem,
  WeekDefinition,
  StockReportItem,
  MB51TransactionItem,
  FGPlanFreezeItem,
  VendorDeliveryScheduleChangeLog
} from '../../types';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Truck,
  TrendingDown,
  Filter,
  Search,
  ExternalLink,
  History,
  ShieldAlert,
  Flame,
  ChevronRight,
  ChevronDown,
  Building2,
  Calendar,
  X,
  Sparkles,
  ArrowUpRight,
  Layers,
  Factory
} from 'lucide-react';

export type RiskTier = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface VendorRiskData {
  vendorCode: string;
  vendorName: string;
  buyerName: string;
  buyerEmail?: string;
  category: string;
  city?: string;
  leadTimeDays: number;
  totalSchedules: number;
  overdueSchedulesCount: number;
  inTransitCount: number;
  onTrackCount: number;
  totalPromisedQty: number;
  totalOverdueQty: number;
  maxDaysOverdue: number;
  overdueSchedules: (VendorDeliverySchedule & {
    componentDescription?: string;
    delayDays: number;
  })[];
  allSchedules: (VendorDeliverySchedule & {
    componentDescription?: string;
    delayDays: number;
  })[];
  suppliedComponents: string[];
  impactedFGs: {
    fgCode: string;
    fgDescription: string;
    line: string;
    isFrozen: boolean;
  }[];
  riskScore: number; // 0 to 100
  riskTier: RiskTier;
  riskReasons: string[];
}

interface SupplyRiskHeatmapProps {
  vendorDeliverySchedules: VendorDeliverySchedule[];
  vendorBuyers: VendorBuyerItem[];
  boms: BOMItem[];
  monthlyPlans: MonthlyPlanItem[];
  weeks: WeekDefinition[];
  selectedMonth: string;
  selectedWeekId?: string;
  stockList: StockReportItem[];
  mb51List?: MB51TransactionItem[];
  planFreezeList?: FGPlanFreezeItem[];
  deliveryScheduleChangeLogs?: VendorDeliveryScheduleChangeLog[];
  activeVendorFilter?: string | null;
  onSelectVendorFilter?: (vendorNameOrCode: string | null) => void;
  onOpenHistoryDrawer?: (filter?: {
    vendorName?: string;
    componentCode?: string;
    poNumber?: string;
    title?: string;
  }) => void;
  onOpenDeliveryModal?: (componentCode: string, schedule?: VendorDeliverySchedule) => void;
  onOpenActionModal?: (vendorName: string, componentCode?: string) => void;
  isCompact?: boolean;
}

export const SupplyRiskHeatmap: React.FC<SupplyRiskHeatmapProps> = ({
  vendorDeliverySchedules,
  vendorBuyers,
  boms,
  monthlyPlans,
  weeks,
  selectedMonth,
  selectedWeekId,
  stockList,
  mb51List = [],
  planFreezeList = [],
  deliveryScheduleChangeLogs = [],
  activeVendorFilter,
  onSelectVendorFilter,
  onOpenHistoryDrawer,
  onOpenDeliveryModal,
  onOpenActionModal,
  isCompact = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [tierFilter, setTierFilter] = useState<'ALL' | RiskTier>('ALL');
  const [buyerFilter, setBuyerFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'HEATMAP_GRID' | 'TABLE' | 'COMPACT'>('HEATMAP_GRID');
  const [selectedVendorDetail, setSelectedVendorDetail] = useState<VendorRiskData | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Selected week context
  const selectedWeek = useMemo(() => {
    const monthWeeks = weeks.filter((w) => w.month === selectedMonth);
    return monthWeeks.find((w) => w.id === selectedWeekId) || monthWeeks.find((w) => w.weekNo === 2) || monthWeeks[0];
  }, [weeks, selectedMonth, selectedWeekId]);

  // Compute Risk Data per Vendor
  const vendorRiskList = useMemo<VendorRiskData[]>(() => {
    // 1. Gather all unique vendors from Master Data and Schedules
    const vendorMap = new Map<string, VendorBuyerItem>();
    vendorBuyers.forEach((vb) => {
      vendorMap.set(vb.vendorCode, vb);
    });

    // Also include any vendor from schedules that might not be in master data
    vendorDeliverySchedules.forEach((s) => {
      if (!vendorMap.has(s.vendorCode)) {
        vendorMap.set(s.vendorCode, {
          id: `vb-dyn-${s.vendorCode}`,
          vendorCode: s.vendorCode,
          vendorName: s.vendorName,
          buyerName: s.buyerName || 'Unassigned',
          category: 'RM',
          suppliedComponents: [s.componentCode],
          leadTimeDays: 7
        });
      }
    });

    const stockMap = new Map<string, StockReportItem>();
    stockList.forEach((st) => stockMap.set(st.partNumber, st));

    const frozenFGsSet = new Set(
      planFreezeList
        .filter((f) => f.status === 'FROZEN' && (f.month === selectedMonth || f.weekId === selectedWeek?.id))
        .map((f) => f.fgCode)
    );

    const monthPlans = monthlyPlans.filter((p) => p.month === selectedMonth);

    // Reference Date for Overdue Calculations:
    // If selected week has a startDate, use it as baseline
    const referenceDateStr = selectedWeek?.startDate || '2026-08-08';
    const referenceDate = new Date(referenceDateStr).getTime();

    const result: VendorRiskData[] = [];

    vendorMap.forEach((vb) => {
      // Find all schedules for this vendor
      const vendorSchedules = vendorDeliverySchedules.filter(
        (s) => s.vendorCode === vb.vendorCode || s.vendorName.toLowerCase() === vb.vendorName.toLowerCase()
      );

      // Components supplied by this vendor
      const suppliedComps = Array.from(
        new Set([...(vb.suppliedComponents || []), ...vendorSchedules.map((s) => s.componentCode)])
      );

      // Find downstream impacted Finished Goods
      const impactedFGsMap = new Map<
        string,
        { fgCode: string; fgDescription: string; line: string; isFrozen: boolean }
      >();

      suppliedComps.forEach((compCode) => {
        const matchingBOMs = boms.filter((b) => b.componentCode === compCode);
        matchingBOMs.forEach((bom) => {
          const plan = monthPlans.find((p) => p.fgCode === bom.fgCode);
          if (plan) {
            impactedFGsMap.set(bom.fgCode, {
              fgCode: bom.fgCode,
              fgDescription: plan.fgDescription,
              line: plan.line || 'Line 1',
              isFrozen: frozenFGsSet.has(bom.fgCode)
            });
          }
        });
      });

      const impactedFGs = Array.from(impactedFGsMap.values());
      const hasFrozenLineImpact = impactedFGs.some((fg) => fg.isFrozen);

      // Evaluate each schedule
      let totalPromisedQty = 0;
      let totalOverdueQty = 0;
      let maxDaysOverdue = 0;
      const overdueSchedules: (VendorDeliverySchedule & {
        componentDescription?: string;
        delayDays: number;
      })[] = [];
      const allSchedules: (VendorDeliverySchedule & {
        componentDescription?: string;
        delayDays: number;
      })[] = [];

      let inTransitCount = 0;
      let onTrackCount = 0;

      vendorSchedules.forEach((s) => {
        totalPromisedQty += s.promisedQty || 0;
        const compStock = stockMap.get(s.componentCode);
        const compDesc = compStock?.materialDescription || `Component ${s.componentCode}`;

        // Calculate days overdue relative to expected delivery date vs reference date
        let delayDays = 0;
        if (s.expectedDeliveryDate) {
          const schedDate = new Date(s.expectedDeliveryDate).getTime();
          if (referenceDate > schedDate) {
            delayDays = Math.max(0, Math.round((referenceDate - schedDate) / (1000 * 60 * 60 * 24)));
          }
        }

        // Determine if overdue or delayed
        const isExplicitlyDelayed =
          s.deliveryStatus === 'DELAYED_AT_RISK' ||
          s.deliveryStatus === 'CANCELLED' ||
          s.deliveryStatus === 'CRITICAL_NO_PO';

        const isLateDate =
          delayDays > 0 &&
          s.deliveryStatus !== 'CONFIRMED_ON_TRACK' &&
          s.deliveryStatus !== 'IN_TRANSIT';

        // Check if delivery arrives after component stock is exhausted
        const isCriticalOverdue = isExplicitlyDelayed || isLateDate || (s.notes && s.notes.toLowerCase().includes('delay'));

        const enrichedSchedule = {
          ...s,
          componentDescription: compDesc,
          delayDays: isCriticalOverdue ? Math.max(delayDays, 3) : delayDays
        };

        allSchedules.push(enrichedSchedule);

        if (isCriticalOverdue) {
          overdueSchedules.push(enrichedSchedule);
          totalOverdueQty += s.promisedQty || 0;
          maxDaysOverdue = Math.max(maxDaysOverdue, enrichedSchedule.delayDays);
        } else if (s.deliveryStatus === 'IN_TRANSIT') {
          inTransitCount++;
        } else {
          onTrackCount++;
        }
      });

      const overdueCount = overdueSchedules.length;
      const totalCount = vendorSchedules.length;

      // Risk score calculation (0 - 100)
      let riskScore = 0;
      const riskReasons: string[] = [];

      if (overdueCount > 0) {
        riskScore += overdueCount * 30;
        riskReasons.push(`${overdueCount} Delivery Schedule(s) Overdue/Delayed`);
      }

      if (maxDaysOverdue > 0) {
        riskScore += Math.min(25, maxDaysOverdue * 5);
        riskReasons.push(`Up to ${maxDaysOverdue} Days Delay Past Commitment`);
      }

      if (hasFrozenLineImpact) {
        riskScore += 20;
        riskReasons.push('Direct Impact on Frozen Production Line');
      }

      if (inTransitCount > 0 && overdueCount === 0) {
        riskScore += inTransitCount * 12;
        riskReasons.push(`${inTransitCount} In-Transit Shipments Monitoring Required`);
      }

      if (totalCount === 0) {
        // No commitments recorded yet
        riskScore += 15;
        riskReasons.push('No Active Delivery Commitments Logged');
      }

      riskScore = Math.min(100, Math.max(0, riskScore));

      // Classify Tier
      let riskTier: RiskTier = 'LOW';
      if (overdueCount >= 2 || riskScore >= 70) {
        riskTier = 'CRITICAL';
      } else if (overdueCount === 1 || riskScore >= 45) {
        riskTier = 'HIGH';
      } else if (inTransitCount > 0 || riskScore >= 20) {
        riskTier = 'MEDIUM';
      } else {
        riskTier = 'LOW';
      }

      result.push({
        vendorCode: vb.vendorCode,
        vendorName: vb.vendorName,
        buyerName: vb.buyerName,
        buyerEmail: vb.buyerEmail,
        category: vb.category,
        city: vb.city,
        leadTimeDays: vb.leadTimeDays,
        totalSchedules: totalCount,
        overdueSchedulesCount: overdueCount,
        inTransitCount,
        onTrackCount,
        totalPromisedQty,
        totalOverdueQty,
        maxDaysOverdue,
        overdueSchedules,
        allSchedules,
        suppliedComponents: suppliedComps,
        impactedFGs,
        riskScore,
        riskTier,
        riskReasons
      });
    });

    // Sort by: Highest Overdue Count first, then Highest Risk Score, then Vendor Name
    return result.sort((a, b) => {
      if (b.overdueSchedulesCount !== a.overdueSchedulesCount) {
        return b.overdueSchedulesCount - a.overdueSchedulesCount;
      }
      if (b.riskScore !== a.riskScore) {
        return b.riskScore - a.riskScore;
      }
      return a.vendorName.localeCompare(b.vendorName);
    });
  }, [
    vendorBuyers,
    vendorDeliverySchedules,
    boms,
    monthlyPlans,
    selectedMonth,
    selectedWeek,
    stockList,
    planFreezeList
  ]);

  // Distinct Buyer list for filter
  const buyerOptions = useMemo(() => {
    const buyers = new Set<string>();
    vendorRiskList.forEach((v) => {
      if (v.buyerName) buyers.add(v.buyerName);
    });
    return Array.from(buyers);
  }, [vendorRiskList]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const totalVendors = vendorRiskList.length;
    const criticalCount = vendorRiskList.filter((v) => v.riskTier === 'CRITICAL').length;
    const highCount = vendorRiskList.filter((v) => v.riskTier === 'HIGH').length;
    const mediumCount = vendorRiskList.filter((v) => v.riskTier === 'MEDIUM').length;
    const lowCount = vendorRiskList.filter((v) => v.riskTier === 'LOW').length;

    const totalOverdueSchedules = vendorRiskList.reduce((sum, v) => sum + v.overdueSchedulesCount, 0);
    const totalOverdueQty = vendorRiskList.reduce((sum, v) => sum + v.totalOverdueQty, 0);
    const vendorsWithOverdue = vendorRiskList.filter((v) => v.overdueSchedulesCount > 0).length;

    return {
      totalVendors,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      totalOverdueSchedules,
      totalOverdueQty,
      vendorsWithOverdue
    };
  }, [vendorRiskList]);

  // Filtered List
  const filteredVendors = useMemo(() => {
    return vendorRiskList.filter((v) => {
      // Search
      const matchesSearch =
        searchTerm === '' ||
        v.vendorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.vendorCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.buyerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.suppliedComponents.some((c) => c.includes(searchTerm));

      // Tier Filter
      const matchesTier = tierFilter === 'ALL' || v.riskTier === tierFilter;

      // Buyer Filter
      const matchesBuyer = buyerFilter === 'ALL' || v.buyerName === buyerFilter;

      return matchesSearch && matchesTier && matchesBuyer;
    });
  }, [vendorRiskList, searchTerm, tierFilter, buyerFilter]);

  // Style helpers for color-coded tiers
  const getTierBadgeStyle = (tier: RiskTier) => {
    switch (tier) {
      case 'CRITICAL':
        return 'bg-rose-100 text-rose-800 border-rose-300';
      case 'HIGH':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'MEDIUM':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'LOW':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    }
  };

  const getHeatmapCardStyle = (tier: RiskTier, isSelected: boolean) => {
    const base = 'transition-all duration-200 rounded-lg border p-3.5 relative overflow-hidden flex flex-col justify-between';
    if (isSelected) {
      return `${base} ring-2 ring-indigo-600 shadow-md bg-indigo-50/40 border-indigo-300`;
    }
    switch (tier) {
      case 'CRITICAL':
        return `${base} bg-rose-50/70 hover:bg-rose-50 border-rose-300/80 shadow-2xs hover:shadow-sm`;
      case 'HIGH':
        return `${base} bg-orange-50/60 hover:bg-orange-50 border-orange-300/80 shadow-2xs hover:shadow-sm`;
      case 'MEDIUM':
        return `${base} bg-amber-50/50 hover:bg-amber-50 border-amber-300/70 shadow-2xs hover:shadow-sm`;
      case 'LOW':
        return `${base} bg-emerald-50/40 hover:bg-emerald-50 border-emerald-300/70 shadow-2xs hover:shadow-sm`;
    }
  };

  const getRiskScoreColor = (score: number) => {
    if (score >= 70) return 'bg-rose-600 text-white';
    if (score >= 45) return 'bg-orange-500 text-white';
    if (score >= 20) return 'bg-amber-500 text-white';
    return 'bg-emerald-600 text-white';
  };

  const handleOpenDetailModal = (vendor: VendorRiskData) => {
    setSelectedVendorDetail(vendor);
    setIsDetailModalOpen(true);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden space-y-3">
      {/* 1. Header Bar: Supply Risk Heatmap Title & Live Metrics */}
      <div className="p-3.5 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white border-b border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30">
              <Flame className="w-5 h-5 animate-pulse text-rose-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-white tracking-tight flex items-center gap-1.5">
                  Supply Risk Heatmap
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-500 text-white uppercase tracking-wider">
                  Overdue Tracker
                </span>
                {activeVendorFilter && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-500 text-white flex items-center gap-1">
                    <span>Filtered: {activeVendorFilter}</span>
                    <button
                      onClick={() => onSelectVendorFilter && onSelectVendorFilter(null)}
                      className="hover:text-rose-200 ml-1 cursor-pointer"
                      title="Clear vendor filter"
                    >
                      ×
                    </button>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Dynamic vendor risk index highlighting suppliers with the highest overdue delivery schedules, delayed PO lines, and line stoppage impact.
              </p>
            </div>
          </div>

          {/* Quick Stats Ticker */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-700/60">
              <span className="text-slate-400 text-[11px]">Vendors with Overdue:</span>
              <span className="font-mono font-bold text-rose-400 text-xs">
                {metrics.vendorsWithOverdue} / {metrics.totalVendors}
              </span>
            </div>

            <div className="flex items-center gap-1.5 bg-rose-950/60 px-2.5 py-1.5 rounded-lg border border-rose-800/60 text-rose-200 font-medium">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              <span>Overdue POs:</span>
              <span className="font-mono font-bold text-white text-xs">{metrics.totalOverdueSchedules} Lines</span>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-700/60">
              <span className="text-slate-400 text-[11px]">Delayed Units:</span>
              <span className="font-mono font-bold text-amber-300 text-xs">
                {metrics.totalOverdueQty.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* 2. Color-Coded Risk Legend & Filtering Tabs */}
        <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* Tier Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-400 font-medium mr-1">Risk Tiers:</span>
            
            <button
              onClick={() => setTierFilter('ALL')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                tierFilter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              All Vendors ({metrics.totalVendors})
            </button>

            <button
              onClick={() => setTierFilter('CRITICAL')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                tierFilter === 'CRITICAL'
                  ? 'bg-rose-500 text-white shadow-xs'
                  : 'bg-rose-950/50 text-rose-300 border border-rose-800/60 hover:bg-rose-900/60'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping inline-block" />
              <span>Critical Overdue ({metrics.criticalCount})</span>
            </button>

            <button
              onClick={() => setTierFilter('HIGH')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                tierFilter === 'HIGH'
                  ? 'bg-orange-500 text-white shadow-xs'
                  : 'bg-orange-950/50 text-orange-300 border border-orange-800/60 hover:bg-orange-900/60'
              }`}
            >
              <span>High Risk ({metrics.highCount})</span>
            </button>

            <button
              onClick={() => setTierFilter('MEDIUM')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                tierFilter === 'MEDIUM'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'bg-amber-950/50 text-amber-300 border border-amber-800/60 hover:bg-amber-900/60'
              }`}
            >
              <span>Moderate Watch ({metrics.mediumCount})</span>
            </button>

            <button
              onClick={() => setTierFilter('LOW')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                tierFilter === 'LOW'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-emerald-950/50 text-emerald-300 border border-emerald-800/60 hover:bg-emerald-900/60'
              }`}
            >
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>Safe / On-Track ({metrics.lowCount})</span>
            </button>
          </div>

          {/* View Mode Controls & Search */}
          <div className="flex items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search vendor / part..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-6 pr-5 py-1 text-[11px] bg-slate-800 border border-slate-700 text-white rounded focus:outline-none focus:border-blue-400 w-36 focus:w-48 transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs cursor-pointer"
                >
                  ×
                </button>
              )}
            </div>

            {/* Buyer Dropdown Filter */}
            <select
              value={buyerFilter}
              onChange={(e) => setBuyerFilter(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-[11px] rounded px-2 py-1 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Buyers</option>
              {buyerOptions.map((b) => (
                <option key={b} value={b}>
                  {b.split('(')[0]}
                </option>
              ))}
            </select>

            {/* View Switcher */}
            <div className="flex items-center bg-slate-800 p-0.5 rounded border border-slate-700 text-[11px]">
              <button
                onClick={() => setViewMode('HEATMAP_GRID')}
                className={`px-2 py-0.5 rounded font-medium transition-colors cursor-pointer ${
                  viewMode === 'HEATMAP_GRID' ? 'bg-slate-700 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
                title="Heatmap Tiles View"
              >
                Tiles
              </button>
              <button
                onClick={() => setViewMode('TABLE')}
                className={`px-2 py-0.5 rounded font-medium transition-colors cursor-pointer ${
                  viewMode === 'TABLE' ? 'bg-slate-700 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
                title="Detailed Table View"
              >
                Table
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Heatmap Content Grid / Table */}
      <div className="p-3 pt-0">
        {filteredVendors.length === 0 ? (
          <div className="py-8 text-center text-slate-400 bg-slate-50 border border-slate-200 rounded-lg">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="font-medium text-slate-600 text-xs">No vendors matched your filter criteria.</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Try resetting the search or tier filter.</p>
          </div>
        ) : viewMode === 'HEATMAP_GRID' ? (
          /* HEATMAP GRID VIEW */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredVendors.map((vendor, idx) => {
              const isSelected = activeVendorFilter === vendor.vendorName || activeVendorFilter === vendor.vendorCode;
              const hasOverdue = vendor.overdueSchedulesCount > 0;
              const cardClass = getHeatmapCardStyle(vendor.riskTier, isSelected);

              return (
                <div key={vendor.vendorCode} className={cardClass}>
                  {/* Top Rank Badge & Risk Meter */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-slate-900 text-white font-mono font-bold text-[10px]">
                        #{idx + 1}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getTierBadgeStyle(vendor.riskTier)}`}>
                        {vendor.riskTier}
                      </span>
                    </div>

                    {/* Risk Score Pill */}
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-500 font-medium">Risk Score:</span>
                      <span className={`px-1.5 py-0.2 rounded font-mono font-bold text-[11px] ${getRiskScoreColor(vendor.riskScore)}`}>
                        {vendor.riskScore}
                      </span>
                    </div>
                  </div>

                  {/* Vendor Name & Code */}
                  <div className="space-y-0.5 mb-2.5">
                    <h4 className="font-bold text-xs text-slate-900 leading-snug flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="truncate" title={vendor.vendorName}>
                        {vendor.vendorName}
                      </span>
                    </h4>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                      <span className="font-mono bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200 text-slate-700">
                        {vendor.vendorCode}
                      </span>
                      <span>• {vendor.buyerName.split('(')[0]}</span>
                    </div>
                  </div>

                  {/* Highlighted Overdue Schedules Callout */}
                  <div
                    className={`rounded-md p-2 mb-2.5 text-xs border ${
                      hasOverdue
                        ? 'bg-rose-100/70 border-rose-300 text-rose-900'
                        : 'bg-emerald-100/60 border-emerald-300 text-emerald-900'
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold">
                      <span className="flex items-center gap-1">
                        {hasOverdue ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        )}
                        <span>
                          {hasOverdue ? `${vendor.overdueSchedulesCount} Overdue Schedule(s)` : 'All Schedules On Track'}
                        </span>
                      </span>
                      {hasOverdue && (
                        <span className="font-mono font-bold text-rose-700">
                          {vendor.totalOverdueQty.toLocaleString()} units
                        </span>
                      )}
                    </div>

                    {/* Delay Severity / Reason */}
                    {hasOverdue ? (
                      <div className="text-[11px] text-rose-700 mt-1 flex flex-wrap items-center gap-1">
                        <span>Max delay: <strong>+{vendor.maxDaysOverdue} days</strong></span>
                        <span>• Affected: <strong>{vendor.overdueSchedules.map((s) => s.componentCode).join(', ')}</strong></span>
                      </div>
                    ) : (
                      <div className="text-[11px] text-emerald-700 mt-0.5">
                        {vendor.totalSchedules} total commitment(s) verified on schedule.
                      </div>
                    )}
                  </div>

                  {/* Downstream Line Impact */}
                  {vendor.impactedFGs.length > 0 && (
                    <div className="mb-3 text-[11px] text-slate-600 bg-white/70 border border-slate-200/80 rounded p-1.5">
                      <div className="font-semibold text-slate-800 flex items-center justify-between mb-0.5 text-[10px] uppercase tracking-wider">
                        <span className="flex items-center gap-1">
                          <Factory className="w-3 h-3 text-slate-500" />
                          <span>Downstream FG Impact:</span>
                        </span>
                        <span>{vendor.impactedFGs.length} FG Lines</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {vendor.impactedFGs.slice(0, 3).map((fg) => (
                          <span
                            key={fg.fgCode}
                            className={`px-1 py-0.2 rounded font-mono text-[9px] ${
                              fg.isFrozen
                                ? 'bg-rose-100 text-rose-900 border border-rose-300 font-bold'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                            title={`${fg.fgCode}: ${fg.fgDescription} (${fg.line}) ${fg.isFrozen ? '[FROZEN PLAN]' : ''}`}
                          >
                            {fg.fgCode} {fg.isFrozen ? '🔒' : ''}
                          </span>
                        ))}
                        {vendor.impactedFGs.length > 3 && (
                          <span className="text-[9px] text-slate-500 font-medium">
                            +{vendor.impactedFGs.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Bottom Action Footer */}
                  <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between gap-1.5 mt-auto">
                    <button
                      type="button"
                      onClick={() => handleOpenDetailModal(vendor)}
                      className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                      title="Inspect all PO lines and overdue delivery batches"
                    >
                      <span>Inspect POs ({vendor.totalSchedules})</span>
                      <ChevronRight className="w-3 h-3 text-slate-400" />
                    </button>

                    <div className="flex items-center gap-1">
                      {/* 1-Click Cockpit Filter Button */}
                      {onSelectVendorFilter && (
                        <button
                          type="button"
                          onClick={() => onSelectVendorFilter(isSelected ? null : vendor.vendorName)}
                          className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100'
                          }`}
                          title={isSelected ? 'Clear filter from cockpit' : `Filter Monday Review Cockpit to ${vendor.vendorName}`}
                        >
                          {isSelected ? 'Filtered' : 'Filter Cockpit'}
                        </button>
                      )}

                      {/* Change History Shortcut */}
                      {onOpenHistoryDrawer && (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenHistoryDrawer({
                              vendorName: vendor.vendorName,
                              title: `Change History: ${vendor.vendorName}`
                            })
                          }
                          className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded border border-slate-200 cursor-pointer transition-colors"
                          title="View revision audit trail for this vendor"
                        >
                          <History className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* DETAILED TABLE MATRIX VIEW */
          <div className="border border-slate-200 rounded-lg overflow-x-auto shadow-2xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold">
                  <th className="py-2.5 px-3 w-10 text-center">Rank</th>
                  <th className="py-2.5 px-3 min-w-[180px]">Vendor Name & Code</th>
                  <th className="py-2.5 px-3 min-w-[140px]">Responsible Buyer</th>
                  <th className="py-2.5 px-3 text-center w-28">Risk Tier & Score</th>
                  <th className="py-2.5 px-3 text-right w-28">Overdue Schedules</th>
                  <th className="py-2.5 px-3 text-right w-28">Overdue Qty</th>
                  <th className="py-2.5 px-3 text-center w-24">Max Delay</th>
                  <th className="py-2.5 px-3 min-w-[150px]">Downstream FG Impact</th>
                  <th className="py-2.5 px-3 text-right w-44">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredVendors.map((vendor, idx) => {
                  const isSelected = activeVendorFilter === vendor.vendorName || activeVendorFilter === vendor.vendorCode;
                  const hasOverdue = vendor.overdueSchedulesCount > 0;

                  return (
                    <tr
                      key={vendor.vendorCode}
                      className={`hover:bg-slate-50 transition-colors ${
                        isSelected
                          ? 'bg-indigo-50/50'
                          : vendor.riskTier === 'CRITICAL'
                          ? 'bg-rose-50/20'
                          : vendor.riskTier === 'HIGH'
                          ? 'bg-orange-50/20'
                          : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-500">
                        #{idx + 1}
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900">{vendor.vendorName}</div>
                        <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1.5">
                          <span>{vendor.vendorCode}</span>
                          <span>• {vendor.category}</span>
                          {vendor.city && <span>• {vendor.city}</span>}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-slate-700">
                        <div className="font-medium">{vendor.buyerName.split('(')[0]}</div>
                        <div className="text-[10px] text-slate-400">{vendor.buyerName.split('(')[1]?.replace(')', '') || ''}</div>
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getTierBadgeStyle(vendor.riskTier)}`}>
                            {vendor.riskTier}
                          </span>
                          <span className={`px-1.5 py-0.2 rounded font-mono text-[10px] font-bold ${getRiskScoreColor(vendor.riskScore)}`}>
                            Score: {vendor.riskScore}
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono">
                        {hasOverdue ? (
                          <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold border border-rose-300">
                            {vendor.overdueSchedulesCount} POs
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-medium">0 (All OK)</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-800">
                        {hasOverdue ? (
                          <span className="text-rose-700">{vendor.totalOverdueQty.toLocaleString()}</span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-center font-mono">
                        {vendor.maxDaysOverdue > 0 ? (
                          <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-800 font-bold border border-rose-200">
                            +{vendor.maxDaysOverdue} days
                          </span>
                        ) : (
                          <span className="text-emerald-600 text-[11px]">On Time</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap gap-1">
                          {vendor.impactedFGs.slice(0, 2).map((fg) => (
                            <span
                              key={fg.fgCode}
                              className={`px-1.5 py-0.2 rounded font-mono text-[10px] ${
                                fg.isFrozen
                                  ? 'bg-rose-100 text-rose-800 font-bold border border-rose-200'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}
                              title={`${fg.fgCode}: ${fg.fgDescription}`}
                            >
                              {fg.fgCode}
                            </span>
                          ))}
                          {vendor.impactedFGs.length > 2 && (
                            <span className="text-[10px] text-slate-400">+{vendor.impactedFGs.length - 2} more</span>
                          )}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenDetailModal(vendor)}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold cursor-pointer transition-colors"
                          >
                            Inspect POs
                          </button>

                          {onSelectVendorFilter && (
                            <button
                              type="button"
                              onClick={() => onSelectVendorFilter(isSelected ? null : vendor.vendorName)}
                              className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer transition-all ${
                                isSelected
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100'
                              }`}
                            >
                              {isSelected ? 'Filtered' : 'Filter'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. VENDOR OVERDUE PO INSPECTOR MODAL */}
      {isDetailModalOpen && selectedVendorDetail && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-3xl w-full p-5 space-y-4 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-rose-50 text-rose-600 border border-rose-200">
                  <Flame className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 text-sm">{selectedVendorDetail.vendorName}</h3>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 font-bold">
                      {selectedVendorDetail.vendorCode}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getTierBadgeStyle(selectedVendorDetail.riskTier)}`}>
                      {selectedVendorDetail.riskTier} RISK
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Buyer: <strong className="text-slate-700">{selectedVendorDetail.buyerName}</strong> • {selectedVendorDetail.totalSchedules} Total Delivery Commitment(s) • Risk Score: {selectedVendorDetail.riskScore}/100
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Risk Drivers Summary */}
            <div className="bg-amber-50/80 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-900">
              <div className="font-semibold mb-1 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>Primary Risk Factors & Bottlenecks:</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                {selectedVendorDetail.riskReasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            </div>

            {/* PO Delivery Schedules Table */}
            <div className="overflow-y-auto flex-1 space-y-2">
              <h4 className="font-bold text-xs text-slate-800">
                Delivery Commitments & PO Schedule Status ({selectedVendorDetail.allSchedules.length} lines)
              </h4>

              {selectedVendorDetail.allSchedules.length === 0 ? (
                <div className="py-6 text-center text-slate-400 bg-slate-50 rounded border border-slate-200">
                  No delivery commitments logged for this vendor yet.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold">
                        <th className="py-2 px-2.5">PO Number</th>
                        <th className="py-2 px-2.5">Component</th>
                        <th className="py-2 px-2.5 text-right">Promised Qty</th>
                        <th className="py-2 px-2.5 text-center">Expected Date</th>
                        <th className="py-2 px-2.5 text-center">Status</th>
                        <th className="py-2 px-2.5">Carrier / Notes</th>
                        <th className="py-2 px-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {selectedVendorDetail.allSchedules.map((s) => {
                        const isOverdue =
                          s.deliveryStatus === 'DELAYED_AT_RISK' ||
                          s.deliveryStatus === 'CANCELLED' ||
                          s.deliveryStatus === 'CRITICAL_NO_PO' ||
                          s.delayDays > 0;

                        return (
                          <tr
                            key={s.id}
                            className={`hover:bg-slate-50 ${isOverdue ? 'bg-rose-50/40' : ''}`}
                          >
                            <td className="py-2 px-2.5 font-mono font-bold text-slate-900">{s.poNumber}</td>
                            <td className="py-2 px-2.5">
                              <div className="font-mono font-semibold text-slate-800">{s.componentCode}</div>
                              <div className="text-[10px] text-slate-500 truncate max-w-[150px]">{s.componentDescription}</div>
                            </td>
                            <td className="py-2 px-2.5 text-right font-mono font-bold text-slate-900">
                              {s.promisedQty.toLocaleString()}
                            </td>
                            <td className="py-2 px-2.5 text-center font-mono">
                              <div className={isOverdue ? 'text-rose-700 font-bold' : 'text-slate-700'}>
                                {s.expectedDeliveryDate}
                              </div>
                              {isOverdue && s.delayDays > 0 && (
                                <div className="text-[9px] text-rose-600 font-semibold">+{s.delayDays} days late</div>
                              )}
                            </td>
                            <td className="py-2 px-2.5 text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                  s.deliveryStatus === 'CONFIRMED_ON_TRACK'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : s.deliveryStatus === 'IN_TRANSIT'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-rose-100 text-rose-800 font-bold'
                                }`}
                              >
                                {s.deliveryStatus.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="py-2 px-2.5 text-slate-600 text-[11px]">
                              {s.carrierOrTracking && <div className="font-medium text-slate-800">{s.carrierOrTracking}</div>}
                              {s.notes && <div className="text-slate-500 text-[10px] italic">{s.notes}</div>}
                            </td>
                            <td className="py-2 px-2.5 text-right">
                              {onOpenDeliveryModal && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsDetailModalOpen(false);
                                    onOpenDeliveryModal(s.componentCode, s);
                                  }}
                                  className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 rounded text-[10px] font-semibold cursor-pointer"
                                >
                                  Reschedule
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {onOpenHistoryDrawer && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsDetailModalOpen(false);
                      onOpenHistoryDrawer({
                        vendorName: selectedVendorDetail.vendorName,
                        title: `Change History: ${selectedVendorDetail.vendorName}`
                      });
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>View Change History</span>
                  </button>
                )}

                {onOpenActionModal && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsDetailModalOpen(false);
                      onOpenActionModal(selectedVendorDetail.vendorName);
                    }}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Escalate Vendor Issue</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {onSelectVendorFilter && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectVendorFilter(selectedVendorDetail.vendorName);
                      setIsDetailModalOpen(false);
                    }}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold cursor-pointer shadow-2xs"
                  >
                    Filter Cockpit by this Vendor
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsDetailModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-900 text-white rounded text-xs font-medium hover:bg-slate-800 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
