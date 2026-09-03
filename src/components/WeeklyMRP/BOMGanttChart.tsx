import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Truck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldAlert,
  Zap,
  TrendingDown,
  Layers,
  Sparkles,
  Check,
  Sliders,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  PackageCheck,
  AlertOctagon,
  BarChart3,
  ExternalLink,
  X,
  Flame,
  GitCommit,
  ArrowRightCircle,
  Filter
} from 'lucide-react';
import {
  ExplodedBOMComponentSummary,
  WeekDefinition,
  VendorDeliverySchedule,
  BOMGanttTimelineResult,
  BOMGanttDaySimulation
} from '../../types';
import { simulateBOMComponentDailyTimeline, formatGanttDate } from '../../utils/bomGanttEngine';

interface BOMGanttChartProps {
  component: ExplodedBOMComponentSummary;
  fgCode: string;
  fgDescription: string;
  fgTotalGrossTarget: number;
  week: WeekDefinition;
  deliverySchedules: VendorDeliverySchedule[];
  onUpdateSchedule?: (updatedSchedule: VendorDeliverySchedule) => void;
  onOpenDeliveryModal?: (comp: ExplodedBOMComponentSummary, existingSched?: VendorDeliverySchedule) => void;
  onOpenDiscussModal?: (comp: ExplodedBOMComponentSummary) => void;
  compact?: boolean;
  defaultHighlightCriticalPath?: boolean;
}

export const BOMGanttChart: React.FC<BOMGanttChartProps> = ({
  component,
  fgCode,
  fgDescription,
  fgTotalGrossTarget,
  week,
  deliverySchedules,
  onUpdateSchedule,
  onOpenDeliveryModal,
  onOpenDiscussModal,
  defaultHighlightCriticalPath = true
}) => {
  const [horizonDays, setHorizonDays] = useState<number>(week.daysCount || 7);
  
  // State for showing the detailed timeline track popup/drawer
  const [showTimelineTrack, setShowTimelineTrack] = useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Visual toggle for Critical Path highlighting
  const [highlightCriticalPath, setHighlightCriticalPath] = useState<boolean>(defaultHighlightCriticalPath);

  // Interactive Simulation State (What-If Analysis)
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const primarySched = component.deliverySchedules[0] || deliverySchedules.find(s => s.componentCode === component.componentCode);
  
  const [simulatedDate, setSimulatedDate] = useState<string>(
    primarySched ? primarySched.expectedDeliveryDate : (week.startDate || '2026-08-08')
  );
  const [simulatedQty, setSimulatedQty] = useState<number>(
    primarySched ? primarySched.promisedQty : Math.max(500, Math.abs(component.stockDeficit) || 1000)
  );

  // Effective delivery schedules
  const effectiveDeliveries = useMemo(() => {
    if (!isSimulating) {
      return deliverySchedules;
    }
    const otherSchedules = deliverySchedules.filter(
      (s) => s.componentCode !== component.componentCode || (primarySched && s.id !== primarySched.id)
    );
    const simulatedSchedule: VendorDeliverySchedule = {
      id: primarySched ? primarySched.id : 'sim-sched-01',
      poNumber: primarySched ? primarySched.poNumber : 'SIM-PO-EXPEDITE',
      componentCode: component.componentCode,
      vendorCode: component.vendorCode,
      vendorName: component.vendorName,
      buyerName: component.buyerName,
      expectedDeliveryDate: simulatedDate,
      weekId: week.id,
      promisedQty: simulatedQty,
      deliveryStatus: 'CONFIRMED_ON_TRACK',
      notes: 'Simulated Expedited Delivery Date for Production Run'
    };
    return [...otherSchedules, simulatedSchedule];
  }, [isSimulating, deliverySchedules, component, primarySched, simulatedDate, simulatedQty, week.id]);

  // Run calculation engine
  const timelineResult: BOMGanttTimelineResult = useMemo(() => {
    return simulateBOMComponentDailyTimeline(
      component,
      fgCode,
      fgDescription,
      fgTotalGrossTarget,
      week,
      effectiveDeliveries,
      {
        horizonDays
      }
    );
  }, [component, fgCode, fgDescription, fgTotalGrossTarget, week, effectiveDeliveries, horizonDays]);

  const { days, isFeasible, firstStockoutDate, criticalPath } = timelineResult;
  const isCriticalPathComp = criticalPath?.isCriticalPath ?? !isFeasible;

  // Calculate coverage percentage
  const totalRequired = fgTotalGrossTarget * component.bomQty;
  const coveragePercent = totalRequired > 0
    ? Math.min(100, Math.round(((component.currentStock + component.expectedDeliveriesTotal) / totalRequired) * 100))
    : 100;

  const handleDateClick = (dateStr: string) => {
    setSelectedDate(dateStr);
    setShowTimelineTrack(true);
  };

  const handleApplySimulatedSchedule = () => {
    if (!onUpdateSchedule || !primarySched) return;
    const updated: VendorDeliverySchedule = {
      ...primarySched,
      expectedDeliveryDate: simulatedDate,
      promisedQty: simulatedQty,
      notes: `Expedited arrival adjusted to meet per-day production requirement on ${simulatedDate}`
    };
    onUpdateSchedule(updated);
    setIsSimulating(false);
  };

  const selectedDaySimulation = useMemo(() => {
    if (!selectedDate) return days[0] || null;
    return days.find((d) => d.date === selectedDate) || days[0] || null;
  }, [days, selectedDate]);

  return (
    <div
      className={`bg-white border rounded-md shadow-2xs overflow-hidden text-xs font-sans transition-all ${
        highlightCriticalPath && isCriticalPathComp
          ? 'border-rose-300 ring-1 ring-rose-400/50'
          : 'border-slate-200'
      }`}
    >
      {/* 1. ULTRA-COMPACT GANTT SPREADSHEET */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left min-w-[640px]">
          {/* Calendar Header */}
          <thead>
            {/* Top Tier: Month / Week + Critical Path Toggle */}
            <tr className="bg-slate-100 text-slate-700 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
              <th className="py-1 px-2.5 w-64 border-r border-slate-200">
                <div className="flex items-center justify-between">
                  <span>Component / Resource</span>
                  <span className="text-[9px] font-normal text-slate-500">Coverage</span>
                </div>
              </th>
              <th colSpan={days.length} className="py-1 px-2 bg-slate-100/90">
                <div className="flex items-center justify-between px-1 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span>{week.month || 'AUG 2026'} — WEEK {week.weekNo}</span>
                    {highlightCriticalPath && isCriticalPathComp && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-rose-600 text-white text-[9px] font-black tracking-wide shadow-2xs animate-pulse">
                        <Zap className="w-2.5 h-2.5 fill-current" />
                        <span>CRITICAL PATH</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 font-normal normal-case text-[10px]">
                    {/* Critical Path Visual Toggle */}
                    <button
                      type="button"
                      onClick={() => setHighlightCriticalPath(!highlightCriticalPath)}
                      className={`px-2 py-0.5 rounded font-bold cursor-pointer inline-flex items-center gap-1 text-[10px] transition-all ${
                        highlightCriticalPath
                          ? 'bg-rose-600 text-white shadow-2xs ring-1 ring-rose-400'
                          : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-200'
                      }`}
                      title="Toggle highlighting of Critical Path dependencies that impact final FG delivery date"
                    >
                      <Zap className={`w-3 h-3 ${highlightCriticalPath ? 'fill-current text-amber-300' : 'text-slate-500'}`} />
                      <span>{highlightCriticalPath ? 'Critical Path Highlight: ON' : 'Highlight Critical Path'}</span>
                    </button>

                    <div className="hidden sm:flex items-center gap-2.5">
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 inline-block" />
                        <span className="text-emerald-900 font-semibold">Green (OK)</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-sm bg-rose-600 inline-block" />
                        <span className="text-rose-900 font-semibold">Red (Stockout)</span>
                      </span>
                    </div>
                  </div>
                </div>
              </th>
            </tr>

            {/* Bottom Tier: Dates */}
            <tr className="bg-slate-50 text-slate-600 text-[10px] border-b border-slate-200 font-medium">
              <th className="py-1 px-2.5 border-r border-slate-200 font-mono text-[10px]">
                <div className="flex items-center justify-between">
                  <span>{component.componentCode}</span>
                  {criticalPath && (
                    <span
                      className={`text-[9px] font-bold px-1 rounded ${
                        criticalPath.slackDays < 0
                          ? 'bg-rose-100 text-rose-800'
                          : criticalPath.slackDays <= 1
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                      title={criticalPath.impactOnFinalDelivery}
                    >
                      Slack: {criticalPath.slackDays}d
                    </span>
                  )}
                </div>
              </th>
              {days.map((day) => {
                const isSelected = selectedDate === day.date && showTimelineTrack;
                const isDayOnCriticalPath = highlightCriticalPath && (day.isStockout || (isCriticalPathComp && day.totalInwardToday > 0));

                return (
                  <th
                    key={day.date}
                    onClick={() => handleDateClick(day.date)}
                    className={`py-1 px-1 text-center border-r border-slate-200 cursor-pointer transition-colors hover:bg-indigo-50 min-w-[60px] ${
                      isSelected
                        ? 'bg-indigo-100 text-indigo-900 font-bold'
                        : isDayOnCriticalPath
                        ? 'bg-rose-50/70 text-rose-950 font-bold'
                        : ''
                    }`}
                    title={`Click to inspect ${day.dayLabel} timeline track`}
                  >
                    <div className="flex items-center justify-center gap-0.5">
                      {isDayOnCriticalPath && (
                        <Zap className="w-2 h-2 text-rose-600 fill-current shrink-0" />
                      )}
                      <span className="font-bold text-slate-800 text-[10px] leading-tight">
                        {day.date.split('-')[2] || day.dayLabel.split(' ')[0]}
                      </span>
                    </div>
                    <div className="text-[9px] text-slate-500 font-normal uppercase leading-tight">
                      {day.dayOfWeek}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Compact Gantt Data Row */}
          <tbody>
            <tr
              className={`border-b border-slate-200 transition-colors h-9 ${
                highlightCriticalPath && isCriticalPathComp
                  ? 'bg-rose-50/30 hover:bg-rose-50/60'
                  : 'hover:bg-slate-50/60'
              }`}
            >
              {/* Left Column: Component Details & Coverage Pill */}
              <td className="py-1 px-2.5 border-r border-slate-200 align-middle">
                <div className="flex items-center justify-between gap-1.5">
                  <div className="truncate pr-1">
                    <div className="flex items-center gap-1.5">
                      {highlightCriticalPath && isCriticalPathComp && (
                        <span className="px-1 py-0.2 rounded bg-rose-600 text-white text-[8px] font-black uppercase tracking-tight shrink-0">
                          CRITICAL
                        </span>
                      )}
                      <span className="font-semibold text-slate-900 text-[11px] truncate" title={component.componentDescription}>
                        {component.componentDescription}
                      </span>
                    </div>
                    <div className="text-[9px] text-slate-500 truncate">
                      {component.vendorName} • {component.bomQty} {component.uom}/FG
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-1">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                        coveragePercent >= 100
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : coveragePercent >= 60
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : 'bg-rose-100 text-rose-800 border border-rose-300'
                      }`}
                    >
                      {coveragePercent}%
                    </span>

                    <button
                      type="button"
                      onClick={() => setShowTimelineTrack(!showTimelineTrack)}
                      className={`p-1 rounded cursor-pointer transition-colors ${
                        showTimelineTrack
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                      title={showTimelineTrack ? 'Hide detailed timeline track' : 'Click to show timeline track'}
                    >
                      <ChevronDown className={`w-3 h-3 transition-transform ${showTimelineTrack ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                </div>
              </td>

              {/* Right Gantt Date Columns: Pure Green / Red Horizontal Bar Segments */}
              {days.map((day) => {
                const isCritical = day.status === 'CRITICAL_STOPPAGE';
                const isWarning = day.status === 'WARNING';
                const isSelected = selectedDate === day.date && showTimelineTrack;
                const hasInward = day.totalInwardToday > 0;
                const isCriticalDelivery = highlightCriticalPath && isCriticalPathComp && hasInward;

                return (
                  <td
                    key={day.date}
                    onClick={() => handleDateClick(day.date)}
                    className={`py-0.5 px-0.5 border-r border-slate-200 text-center align-middle cursor-pointer relative ${
                      isSelected ? 'bg-indigo-50/60' : ''
                    }`}
                  >
                    {/* Compact Horizontal Bar Pill (Green or Red) */}
                    <div
                      className={`w-full h-7 rounded-xs flex items-center justify-center px-1 text-[10px] font-bold transition-all shadow-2xs relative ${
                        isCritical
                          ? 'bg-rose-600 hover:bg-rose-700 text-white'
                          : isWarning
                          ? 'bg-amber-500 hover:bg-amber-600 text-white'
                          : day.isWorkingDay
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          : 'bg-slate-300 text-slate-600'
                      } ${
                        isSelected
                          ? 'ring-2 ring-indigo-500 ring-offset-1 z-10'
                          : highlightCriticalPath && isCritical
                          ? 'ring-2 ring-rose-500 ring-offset-1 ring-dashed animate-pulse'
                          : highlightCriticalPath && isCriticalDelivery
                          ? 'ring-2 ring-amber-400 ring-offset-1'
                          : ''
                      }`}
                      title={`${day.dayLabel}: ${
                        isCritical
                          ? `Critical Path Bottleneck: -${day.deficitToday} ${component.uom} deficit (Delays FG Delivery)`
                          : hasInward
                          ? `Vendor Delivery: +${day.totalInwardToday.toLocaleString()} ${component.uom} (${isCriticalDelivery ? 'Gating Task on Critical Path' : 'Safe Inward'})`
                          : `Projected Stock: ${day.endingStock} ${component.uom}`
                      } (Click to open timeline track)`}
                    >
                      {hasInward ? (
                        <div className="flex items-center gap-0.5 truncate text-[9px]">
                          {isCriticalDelivery && (
                            <Zap className="w-2.5 h-2.5 text-amber-300 fill-current shrink-0" />
                          )}
                          <Truck className="w-2.5 h-2.5 shrink-0" />
                          <span className="font-mono">+{day.totalInwardToday.toLocaleString()}</span>
                        </div>
                      ) : isCritical ? (
                        <div className="flex items-center gap-0.5">
                          {highlightCriticalPath && <Zap className="w-2 h-2 fill-current shrink-0" />}
                          <span className="text-[9px] uppercase font-black tracking-tight">STOP</span>
                        </div>
                      ) : day.isWorkingDay ? (
                        <span className="text-[9px] font-semibold opacity-95">OK</span>
                      ) : (
                        <span className="text-[8px] opacity-75">OFF</span>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* 2. CRITICAL PATH DEPENDENCY IMPACT CALLOUT (Visible when Critical Path is toggled ON) */}
      {highlightCriticalPath && isCriticalPathComp && criticalPath && (
        <div className="px-3 py-2 bg-rose-50/90 border-t border-rose-200 text-rose-950 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-rose-600 text-white shrink-0">
              <Zap className="w-3.5 h-3.5 fill-current" />
            </span>
            <div>
              <span className="font-bold text-rose-900 block leading-tight">
                Critical Path Dependency Impact on Final FG Delivery:
              </span>
              <span className="text-rose-800 text-[10px]">
                {criticalPath.impactOnFinalDelivery}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[10px]">
            {criticalPath.delayInFgDays > 0 ? (
              <span className="px-2 py-0.5 rounded bg-rose-200 text-rose-900 font-bold border border-rose-300">
                🚨 FG Delay: +{criticalPath.delayInFgDays} Day(s)
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded bg-amber-200 text-amber-900 font-bold border border-amber-300">
                ⚠️ Tight Slack: {criticalPath.slackDays}d Float
              </span>
            )}

            <button
              type="button"
              onClick={() => setIsSimulating(true)}
              className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white rounded font-bold cursor-pointer inline-flex items-center gap-1 shadow-2xs"
            >
              <Sliders className="w-2.5 h-2.5" />
              <span>Simulate Expedite to Clear Critical Path</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. SLIM FOOTER BAR: Verdict & Quick Action Buttons */}
      <div className="px-2.5 py-1.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-1.5">
          {isFeasible ? (
            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Gantt status is Green: Continuous production guaranteed.</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-rose-700 font-semibold">
              <AlertOctagon className="w-3.5 h-3.5 text-rose-600 animate-pulse" />
              <span>Red stockout on {formatGanttDate(firstStockoutDate || '').label}: Vendor arrival delayed.</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsSimulating(!isSimulating)}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold border cursor-pointer inline-flex items-center gap-1 transition-all ${
              isSimulating
                ? 'bg-amber-500 text-white border-amber-600'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
            }`}
          >
            <Sliders className="w-2.5 h-2.5" />
            <span>{isSimulating ? 'Close Simulator' : 'What-If Expedite'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowTimelineTrack(!showTimelineTrack)}
            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer inline-flex items-center gap-0.5"
          >
            <span>{showTimelineTrack ? 'Hide Timeline Track ▲' : 'Click to View Timeline Track ▼'}</span>
          </button>
        </div>
      </div>

      {/* 4. INTERACTIVE WHAT-IF SIMULATOR */}
      {isSimulating && (
        <div className="bg-amber-50/90 border-t border-amber-200 p-2 text-xs text-amber-950 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="font-semibold text-amber-900 text-[11px]">Expedite PO Date:</span>
            <input
              type="date"
              value={simulatedDate}
              onChange={(e) => setSimulatedDate(e.target.value)}
              className="bg-white border border-amber-300 rounded px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-900"
            />
            <input
              type="number"
              value={simulatedQty}
              onChange={(e) => setSimulatedQty(Number(e.target.value))}
              step={50}
              className="bg-white border border-amber-300 rounded px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-900 w-20"
              title="Promised quantity"
            />
            <span className="text-[10px] text-amber-800">
              (Target date to eliminate critical path: <strong>{firstStockoutDate || week.startDate}</strong>)
            </span>
          </div>

          <div className="flex items-center gap-2">
            {onUpdateSchedule && primarySched && (
              <button
                type="button"
                onClick={handleApplySimulatedSchedule}
                className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-[11px] cursor-pointer inline-flex items-center gap-1 shadow-2xs"
              >
                <Check className="w-3 h-3" />
                <span>Save to ERP</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setSimulatedDate(primarySched ? primarySched.expectedDeliveryDate : (week.startDate || '2026-08-08'));
                setSimulatedQty(primarySched ? primarySched.promisedQty : 1000);
                setIsSimulating(false);
              }}
              className="px-2 py-0.5 bg-white text-amber-900 border border-amber-300 rounded text-[11px] cursor-pointer"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* 5. EXPANDABLE DETAILED TIMELINE TRACK */}
      {showTimelineTrack && (
        <div className="p-3 bg-slate-900 text-white border-t border-slate-700 space-y-2.5">
          {/* Header of Timeline Track */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 text-xs">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
              <span className="font-bold text-slate-100">
                Timeline Track Analysis: {component.componentCode} ({component.componentDescription})
              </span>
              {isCriticalPathComp && (
                <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[9px] font-bold">
                  ⚡ Critical Path Task
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowTimelineTrack(false)}
              className="text-slate-400 hover:text-white cursor-pointer p-0.5"
              title="Close timeline track"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Selected Date Metric Cards */}
          {selectedDaySimulation && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-mono">
              <div className="bg-slate-800 p-1.5 rounded border border-slate-700">
                <span className="text-slate-400 block text-[9px]">1. Opening Inventory:</span>
                <span className="text-xs font-bold text-white">
                  {selectedDaySimulation.startingStock.toLocaleString()} {component.uom}
                </span>
              </div>
              <div className="bg-slate-800 p-1.5 rounded border border-slate-700">
                <span className="text-slate-400 block text-[9px]">2. Vendor Deliveries:</span>
                <span className="text-xs font-bold text-emerald-400">
                  +{selectedDaySimulation.totalInwardToday.toLocaleString()} {component.uom}
                </span>
              </div>
              <div className="bg-slate-800 p-1.5 rounded border border-slate-700">
                <span className="text-slate-400 block text-[9px]">3. Production Consumption:</span>
                <span className="text-xs font-bold text-rose-300">
                  -{selectedDaySimulation.dailyReq.toLocaleString()} {component.uom}
                </span>
              </div>
              <div className="bg-slate-800 p-1.5 rounded border border-slate-700">
                <span className="text-slate-400 block text-[9px]">4. Projected Ending Balance:</span>
                <span
                  className={`text-xs font-bold ${
                    selectedDaySimulation.endingStock < 0 ? 'text-rose-400 font-black' : 'text-emerald-400'
                  }`}
                >
                  {selectedDaySimulation.endingStock > 0 ? '+' : ''}
                  {selectedDaySimulation.endingStock.toLocaleString()} {component.uom}
                </span>
              </div>
            </div>
          )}

          {/* Full Week Timeline Table */}
          <div className="overflow-x-auto rounded border border-slate-700">
            <table className="w-full text-[10px] font-mono border-collapse min-w-[580px]">
              <thead>
                <tr className="bg-slate-800 text-slate-300 text-center">
                  <th className="py-1 px-2 text-left w-36 font-sans">Track Metric</th>
                  {days.map((d) => (
                    <th key={d.date} className="py-1 px-1 border-l border-slate-700">
                      <div>{d.dayLabel}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-center">
                {/* Line Status */}
                <tr>
                  <td className="py-1 px-2 text-left font-sans text-slate-300 bg-slate-800/60 font-semibold">
                    Line Status
                  </td>
                  {days.map((d) => (
                    <td key={d.date} className="py-1 px-1 border-l border-slate-800">
                      <span
                        className={`px-1 py-0.5 rounded text-[9px] font-bold ${
                          d.status === 'CRITICAL_STOPPAGE'
                            ? 'bg-rose-600 text-white'
                            : d.isWorkingDay
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-700 text-slate-400'
                        }`}
                      >
                        {d.status === 'CRITICAL_STOPPAGE' ? 'HALTED' : d.isWorkingDay ? 'RUNNING' : 'OFF'}
                      </span>
                    </td>
                  ))}
                </tr>

                {/* Inward Arrival */}
                <tr>
                  <td className="py-1 px-2 text-left font-sans text-slate-300 bg-slate-800/60">
                    Vendor Arrivals
                  </td>
                  {days.map((d) => (
                    <td key={d.date} className="py-1 px-1 border-l border-slate-800 text-emerald-400 font-bold">
                      {d.totalInwardToday > 0 ? `+${d.totalInwardToday.toLocaleString()}` : '—'}
                    </td>
                  ))}
                </tr>

                {/* Consumption */}
                <tr>
                  <td className="py-1 px-2 text-left font-sans text-slate-300 bg-slate-800/60">
                    Daily Burn Req
                  </td>
                  {days.map((d) => (
                    <td key={d.date} className="py-1 px-1 border-l border-slate-800 text-rose-300">
                      {d.dailyReq > 0 ? `-${d.dailyReq.toLocaleString()}` : '—'}
                    </td>
                  ))}
                </tr>

                {/* Ending Balance */}
                <tr>
                  <td className="py-1 px-2 text-left font-sans text-slate-300 bg-slate-800/60 font-semibold">
                    Projected Stock
                  </td>
                  {days.map((d) => (
                    <td
                      key={d.date}
                      className={`py-1 px-1 border-l border-slate-800 font-bold ${
                        d.endingStock < 0 ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {d.endingStock.toLocaleString()}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Multi-Component Compact Master Gantt Table
 * Displays all components of a Finished Good in one unified compact spreadsheet sheet,
 * featuring Critical Path highlights, Slack calculation, and dependency impact indicators.
 */
interface MultiComponentMasterGanttProps {
  fgCode: string;
  fgDescription: string;
  fgTotalGrossTarget: number;
  week: WeekDefinition;
  components: ExplodedBOMComponentSummary[];
  deliverySchedules: VendorDeliverySchedule[];
  onUpdateSchedule?: (updatedSchedule: VendorDeliverySchedule) => void;
  defaultHighlightCriticalPath?: boolean;
}

export const MultiComponentMasterGantt: React.FC<MultiComponentMasterGanttProps> = ({
  fgCode,
  fgDescription,
  fgTotalGrossTarget,
  week,
  components,
  deliverySchedules,
  onUpdateSchedule,
  defaultHighlightCriticalPath = true
}) => {
  const [selectedCompId, setSelectedCompId] = useState<string | null>(null);
  const [highlightCriticalPath, setHighlightCriticalPath] = useState<boolean>(defaultHighlightCriticalPath);
  const [filterCriticalOnly, setFilterCriticalOnly] = useState<boolean>(false);

  // Pre-calculate simulation for each component
  const evaluatedComponents = useMemo(() => {
    return components.map((comp) => {
      const sim = simulateBOMComponentDailyTimeline(
        comp,
        fgCode,
        fgDescription,
        fgTotalGrossTarget,
        week,
        deliverySchedules,
        { horizonDays: week.daysCount || 7 }
      );
      const totalRequired = fgTotalGrossTarget * comp.bomQty;
      const coveragePercent = totalRequired > 0
        ? Math.min(100, Math.round(((comp.currentStock + comp.expectedDeliveriesTotal) / totalRequired) * 100))
        : 100;

      const isCriticalPath = sim.criticalPath?.isCriticalPath ?? !sim.isFeasible;

      return {
        comp,
        sim,
        coveragePercent,
        isCriticalPath,
        slackDays: sim.criticalPath?.slackDays ?? (sim.isFeasible ? 3 : -1),
        impact: sim.criticalPath?.impactOnFinalDelivery || ''
      };
    });
  }, [components, fgCode, fgDescription, fgTotalGrossTarget, week, deliverySchedules]);

  // Critical path summary for Finished Good
  const criticalCount = evaluatedComponents.filter((c) => c.isCriticalPath).length;
  const maxDelayDays = Math.max(0, ...evaluatedComponents.map((c) => c.sim.criticalPath?.delayInFgDays || 0));
  const bottleneckItem = evaluatedComponents.find((c) => (c.sim.criticalPath?.delayInFgDays || 0) === maxDelayDays && maxDelayDays > 0);

  const displayList = useMemo(() => {
    if (filterCriticalOnly) {
      return evaluatedComponents.filter((c) => c.isCriticalPath);
    }
    return evaluatedComponents;
  }, [evaluatedComponents, filterCriticalOnly]);

  const daysHeader = evaluatedComponents[0]?.sim.days || [];

  return (
    <div
      className={`bg-white border rounded-md shadow-2xs overflow-hidden text-xs font-sans transition-all ${
        highlightCriticalPath && criticalCount > 0
          ? 'border-rose-300 ring-1 ring-rose-400/40'
          : 'border-slate-200'
      }`}
    >
      {/* Top Banner: Critical Path Summary Bar */}
      {highlightCriticalPath && (
        <div className="bg-slate-900 text-white px-3 py-2 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-rose-600 text-white flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 fill-current" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-[12px]">Critical Path Dependency Engine</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    criticalCount > 0 ? 'bg-rose-500 text-white animate-pulse' : 'bg-emerald-600 text-white'
                  }`}
                >
                  {criticalCount > 0 ? `${criticalCount} Bottlenecks on Critical Path` : 'All Dependencies On-Track'}
                </span>
              </div>
              <div className="text-slate-300 text-[10px]">
                {criticalCount > 0 && bottleneckItem ? (
                  <span>
                    🚨 Final FG Delivery Risk: <strong>+{maxDelayDays} Day(s) Delay</strong> caused by{' '}
                    <span className="text-rose-300 font-bold">{bottleneckItem.comp.componentDescription}</span>.
                  </span>
                ) : (
                  <span>
                    ✅ Continuous assembly guaranteed. No component shortages delay the final FG delivery date.
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            {/* Filter Critical Only */}
            {criticalCount > 0 && (
              <button
                type="button"
                onClick={() => setFilterCriticalOnly(!filterCriticalOnly)}
                className={`px-2 py-0.5 rounded font-semibold cursor-pointer inline-flex items-center gap-1 border transition-colors ${
                  filterCriticalOnly
                    ? 'bg-rose-600 text-white border-rose-500'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
              >
                <Filter className="w-3 h-3" />
                <span>{filterCriticalOnly ? 'Show All Materials' : `Filter Critical (${criticalCount})`}</span>
              </button>
            )}

            {/* Toggle Critical Path Highlight */}
            <button
              type="button"
              onClick={() => setHighlightCriticalPath(!highlightCriticalPath)}
              className={`px-2.5 py-0.5 rounded font-bold cursor-pointer inline-flex items-center gap-1 transition-all ${
                highlightCriticalPath
                  ? 'bg-amber-400 text-slate-950 shadow-2xs'
                  : 'bg-slate-800 text-slate-300 border border-slate-700'
              }`}
            >
              <Zap className="w-3 h-3 fill-current" />
              <span>Critical Path: {highlightCriticalPath ? 'ON' : 'OFF'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Spreadsheet Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left min-w-[680px]">
          <thead>
            {/* Header Tier 1: Weeks */}
            <tr className="bg-slate-100 text-slate-700 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
              <th className="py-1 px-2.5 w-68 border-r border-slate-200">
                <div className="flex items-center justify-between">
                  <span>BOM Component</span>
                  <span className="text-[9px] font-normal text-slate-500">Slack / Cov</span>
                </div>
              </th>
              <th colSpan={daysHeader.length} className="py-1 px-2 bg-slate-100/90">
                <div className="flex items-center justify-between px-2 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span>{week.month || 'AUG 2026'} — WEEK {week.weekNo} ({week.startDate} to {week.endDate})</span>
                  </div>

                  <div className="flex items-center gap-3 font-normal normal-case text-[10px]">
                    {!highlightCriticalPath && (
                      <button
                        type="button"
                        onClick={() => setHighlightCriticalPath(true)}
                        className="px-2 py-0.5 rounded font-bold cursor-pointer inline-flex items-center gap-1 text-[10px] bg-rose-50 text-rose-700 border border-rose-300 hover:bg-rose-100"
                        title="Highlight dependencies directly impacting final delivery date"
                      >
                        <Zap className="w-3 h-3 text-rose-600 fill-current" />
                        <span>Highlight Critical Path</span>
                      </button>
                    )}

                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 inline-block" />
                        <span className="text-emerald-900 font-semibold">Green (OK)</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-sm bg-rose-600 inline-block" />
                        <span className="text-rose-900 font-semibold">Red (Deficit)</span>
                      </span>
                      {highlightCriticalPath && (
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 border border-amber-600 inline-block" />
                          <span className="text-amber-900 font-bold">⚡ Critical Arrival</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </th>
            </tr>

            {/* Header Tier 2: Dates */}
            <tr className="bg-slate-50 text-slate-600 text-[10px] border-b border-slate-200 font-medium">
              <th className="py-1 px-2.5 border-r border-slate-200 font-mono text-[10px]">
                {fgCode} ({displayList.length} Materials)
              </th>
              {daysHeader.map((day) => (
                <th
                  key={day.date}
                  className="py-1 px-1 text-center border-r border-slate-200 min-w-[58px]"
                >
                  <div className="font-bold text-slate-800 text-[10px] leading-tight">
                    {day.date.split('-')[2] || day.dayLabel.split(' ')[0]}
                  </div>
                  <div className="text-[9px] text-slate-500 font-normal uppercase leading-tight">
                    {day.dayOfWeek}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {displayList.map(({ comp, sim, coveragePercent, isCriticalPath, slackDays, impact }) => {
              const isSelected = selectedCompId === comp.id;

              return (
                <React.Fragment key={comp.id}>
                  <tr
                    onClick={() => setSelectedCompId(isSelected ? null : comp.id)}
                    className={`cursor-pointer transition-colors h-8.5 ${
                      isSelected
                        ? 'bg-indigo-50/60'
                        : highlightCriticalPath && isCriticalPath
                        ? 'bg-rose-50/40 hover:bg-rose-50/70 border-l-4 border-l-rose-600'
                        : highlightCriticalPath
                        ? 'opacity-85 hover:opacity-100 hover:bg-slate-50'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    {/* Component Info */}
                    <td className="py-1 px-2.5 border-r border-slate-200 align-middle">
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="truncate pr-1">
                          <div className="flex items-center gap-1.5">
                            {highlightCriticalPath && isCriticalPath && (
                              <span className="px-1 py-0.2 rounded bg-rose-600 text-white text-[8px] font-black uppercase tracking-tight shrink-0">
                                ⚡ CRITICAL
                              </span>
                            )}
                            <span className="font-semibold text-slate-900 text-[11px] truncate" title={comp.componentDescription}>
                              {comp.componentDescription}
                            </span>
                          </div>
                          <div className="text-[9px] text-slate-500 truncate font-mono">
                            {comp.componentCode} • {comp.bomQty} {comp.uom}/FG
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-1">
                          {/* Slack Pill */}
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono ${
                              slackDays < 0
                                ? 'bg-rose-600 text-white'
                                : slackDays <= 1
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                            title={impact}
                          >
                            {slackDays < 0 ? `${slackDays}d` : `+${slackDays}d`}
                          </span>

                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                              coveragePercent >= 100
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : coveragePercent >= 60
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : 'bg-rose-100 text-rose-800 border border-rose-300'
                            }`}
                          >
                            {coveragePercent}%
                          </span>
                          <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isSelected ? 'rotate-180 text-indigo-600' : ''}`} />
                        </div>
                      </div>
                    </td>

                    {/* Date Grid Cells (Green / Red Horizontal Bars) */}
                    {sim.days.map((day) => {
                      const isCritical = day.status === 'CRITICAL_STOPPAGE';
                      const isWarning = day.status === 'WARNING';
                      const hasInward = day.totalInwardToday > 0;
                      const isCriticalDelivery = highlightCriticalPath && isCriticalPath && hasInward;

                      return (
                        <td
                          key={day.date}
                          className="py-0.5 px-0.5 border-r border-slate-200 text-center align-middle"
                        >
                          <div
                            className={`w-full h-6.5 rounded-xs flex items-center justify-center px-1 text-[9px] font-bold transition-all shadow-2xs relative ${
                              isCritical
                                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                                : isWarning
                                ? 'bg-amber-500 hover:bg-amber-600 text-white'
                                : day.isWorkingDay
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                : 'bg-slate-300 text-slate-600'
                            } ${
                              highlightCriticalPath && isCritical
                                ? 'ring-1.5 ring-rose-500 ring-offset-0.5'
                                : highlightCriticalPath && isCriticalDelivery
                                ? 'ring-1.5 ring-amber-400 ring-offset-0.5'
                                : ''
                            }`}
                            title={`${comp.componentCode} on ${day.dayLabel}: ${
                              isCritical
                                ? `Deficit: -${day.deficitToday} ${comp.uom} (Critical Path: Halts line & delays FG delivery)`
                                : hasInward
                                ? `Arrival: +${day.totalInwardToday} ${comp.uom} (${isCriticalDelivery ? 'Critical Path Gating Task' : 'Safe Inward'})`
                                : `Stock: ${day.endingStock} ${comp.uom}`
                            }`}
                          >
                            {hasInward ? (
                              <span className="flex items-center gap-0.5 truncate font-mono text-[8.5px]">
                                {isCriticalDelivery && (
                                  <Zap className="w-2 h-2 text-amber-300 fill-current shrink-0" />
                                )}
                                <Truck className="w-2 h-2 shrink-0" />
                                <span>+{day.totalInwardToday}</span>
                              </span>
                            ) : isCritical ? (
                              <div className="flex items-center gap-0.5">
                                {highlightCriticalPath && <Zap className="w-2 h-2 fill-current shrink-0" />}
                                <span className="uppercase text-[8px] font-black">STOP</span>
                              </div>
                            ) : day.isWorkingDay ? (
                              <span className="opacity-95 text-[8.5px]">OK</span>
                            ) : (
                              <span className="text-[7.5px] opacity-75">OFF</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>

                  {/* Inline Timeline Track Drilldown if clicked */}
                  {isSelected && (
                    <tr className="bg-slate-900 text-white">
                      <td colSpan={daysHeader.length + 1} className="p-2.5">
                        <BOMGanttChart
                          component={comp}
                          fgCode={fgCode}
                          fgDescription={fgDescription}
                          fgTotalGrossTarget={fgTotalGrossTarget}
                          week={week}
                          deliverySchedules={deliverySchedules}
                          onUpdateSchedule={onUpdateSchedule}
                          defaultHighlightCriticalPath={highlightCriticalPath}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
