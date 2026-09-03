import React, { useState, useMemo } from 'react';
import {
  History,
  X,
  Search,
  Filter,
  ArrowRight,
  Calendar,
  User,
  Clock,
  FileText,
  Truck,
  CheckCircle2,
  AlertTriangle,
  Download,
  Copy,
  Check,
  Tag,
  Layers,
  ChevronRight,
  Maximize2,
  Minimize2,
  PackageCheck,
  Sparkles,
  ShieldCheck,
  RotateCcw
} from 'lucide-react';
import {
  VendorDeliveryScheduleChangeLog,
  FGPlanFreezeItem,
  VendorDeliverySchedule
} from '../../types';

export interface HistoryDrawerFilter {
  poNumber?: string;
  componentCode?: string;
  componentDescription?: string;
  vendorName?: string;
  title?: string;
}

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  filter?: HistoryDrawerFilter | null;
  onClearFilter?: () => void;
  deliveryScheduleChangeLogs: VendorDeliveryScheduleChangeLog[];
  planFreezeList?: FGPlanFreezeItem[];
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  filter,
  onClearFilter,
  deliveryScheduleChangeLogs,
  planFreezeList = []
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [isExpandedFull, setIsExpandedFull] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filter logs based on targeted component/PO or search query
  const filteredLogs = useMemo(() => {
    let list = [...deliveryScheduleChangeLogs];

    // Targeted filter from caller
    if (filter) {
      if (filter.poNumber) {
        list = list.filter(
          (log) =>
            log.poNumber?.toLowerCase() === filter.poNumber?.toLowerCase() ||
            log.scheduleId === filter.poNumber
        );
      } else if (filter.componentCode) {
        list = list.filter(
          (log) => log.componentCode?.toLowerCase() === filter.componentCode?.toLowerCase()
        );
      }
    }

    // Category filter
    if (selectedCategory === 'DATE') {
      list = list.filter(
        (log) =>
          log.fieldChanged.toLowerCase().includes('date') ||
          log.fieldChanged.toLowerCase().includes('arrival')
      );
    } else if (selectedCategory === 'QTY') {
      list = list.filter(
        (log) =>
          log.fieldChanged.toLowerCase().includes('qty') ||
          log.fieldChanged.toLowerCase().includes('quantity')
      );
    } else if (selectedCategory === 'STATUS') {
      list = list.filter(
        (log) =>
          log.fieldChanged.toLowerCase().includes('status') ||
          log.fieldChanged.toLowerCase().includes('cancelled')
      );
    }

    // Search term
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (log) =>
          log.poNumber?.toLowerCase().includes(q) ||
          log.componentCode?.toLowerCase().includes(q) ||
          log.componentDescription?.toLowerCase().includes(q) ||
          log.vendorName?.toLowerCase().includes(q) ||
          log.changedBy?.toLowerCase().includes(q) ||
          log.fieldChanged?.toLowerCase().includes(q) ||
          log.reasonForChange?.toLowerCase().includes(q) ||
          String(log.oldValue).toLowerCase().includes(q) ||
          String(log.newValue).toLowerCase().includes(q)
      );
    }

    // Sort newest first
    return list.sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
  }, [deliveryScheduleChangeLogs, filter, selectedCategory, searchTerm]);

  // Handle Copy details
  const handleCopyLog = (log: VendorDeliveryScheduleChangeLog) => {
    const text = `[AUDIT LOG] ${log.changedAt}\nUser: ${log.changedBy}\nPO: ${log.poNumber} | Component: ${log.componentCode} (${log.vendorName})\nField: ${log.fieldChanged}\nPrevious: ${log.oldValue}\nCurrent: ${log.newValue}\nReason: ${log.reasonForChange}`;
    navigator.clipboard.writeText(text);
    setCopiedId(log.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Export CSV
  const handleExportCSV = () => {
    if (filteredLogs.length === 0) return;
    const headers = [
      'Timestamp',
      'Modified By',
      'PO Number',
      'Component Code',
      'Component Description',
      'Vendor Name',
      'Field Changed',
      'Previous Value',
      'Current Value',
      'Reason For Change'
    ];

    const rows = filteredLogs.map((log) => [
      `"${log.changedAt}"`,
      `"${log.changedBy}"`,
      `"${log.poNumber}"`,
      `"${log.componentCode}"`,
      `"${log.componentDescription || ''}"`,
      `"${log.vendorName || ''}"`,
      `"${log.fieldChanged}"`,
      `"${String(log.oldValue).replace(/"/g, '""')}"`,
      `"${String(log.newValue).replace(/"/g, '""')}"`,
      `"${log.reasonForChange.replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `audit_history_${filter?.poNumber || filter?.componentCode || 'all'}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex justify-end transition-opacity duration-300">
      {/* Sliding Drawer Container */}
      <div
        className={`bg-white h-full shadow-2xl flex flex-col transition-all duration-300 ease-in-out border-l border-slate-200 ${
          isExpandedFull ? 'w-full md:w-[90vw]' : 'w-full md:w-[620px] lg:w-[680px]'
        }`}
      >
        {/* Top Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-600/30 border border-indigo-500/40 text-indigo-400">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-100">
                  {filter?.title || 'Data Point Change History'}
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-slate-800 text-indigo-300 text-xs font-mono font-semibold border border-slate-700">
                  {filteredLogs.length} {filteredLogs.length === 1 ? 'event' : 'events'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Timestamped audit log of schedule adjustments, date shifts, and plan modifications
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-slate-400">
            {/* Expand / Minimize Width */}
            <button
              type="button"
              onClick={() => setIsExpandedFull(!isExpandedFull)}
              className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              title={isExpandedFull ? 'Restore normal drawer width' : 'Expand drawer width'}
            >
              {isExpandedFull ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Export CSV */}
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={filteredLogs.length === 0}
              className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition-colors cursor-pointer disabled:opacity-40"
              title="Export filtered logs to CSV"
            >
              <Download className="w-4 h-4" />
            </button>

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors cursor-pointer ml-1"
              title="Close history drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter / Scope Active Banner */}
        {filter && (filter.poNumber || filter.componentCode) && (
          <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between text-xs text-indigo-950 shrink-0">
            <div className="flex items-center gap-2 truncate">
              <span className="font-semibold text-indigo-900">Filtered Target:</span>
              {filter.poNumber && (
                <span className="px-1.5 py-0.5 rounded bg-indigo-200/80 font-mono font-bold text-indigo-900">
                  PO: {filter.poNumber}
                </span>
              )}
              {filter.componentCode && (
                <span className="px-1.5 py-0.5 rounded bg-indigo-200/80 font-mono font-bold text-indigo-900">
                  Part: {filter.componentCode}
                </span>
              )}
              {filter.componentDescription && (
                <span className="text-slate-600 truncate">({filter.componentDescription})</span>
              )}
            </div>

            {onClearFilter && (
              <button
                type="button"
                onClick={onClearFilter}
                className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 underline cursor-pointer shrink-0 ml-2"
              >
                View All History
              </button>
            )}
          </div>
        )}

        {/* Search & Category Filter Toolbar */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 space-y-2 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by PO#, Part, Buyer, Field, Reason, or Previous/Current Value..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-8 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer text-xs"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto text-[11px]">
            <span className="text-slate-500 font-medium mr-1 text-[10px] uppercase tracking-wider">
              Filter:
            </span>
            <button
              type="button"
              onClick={() => setSelectedCategory('ALL')}
              className={`px-2.5 py-0.5 rounded-full font-semibold cursor-pointer transition-colors ${
                selectedCategory === 'ALL'
                  ? 'bg-slate-800 text-white'
                  : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'
              }`}
            >
              All Events
            </button>
            <button
              type="button"
              onClick={() => setSelectedCategory('DATE')}
              className={`px-2.5 py-0.5 rounded-full font-semibold cursor-pointer transition-colors ${
                selectedCategory === 'DATE'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'
              }`}
            >
              Date Shifts
            </button>
            <button
              type="button"
              onClick={() => setSelectedCategory('QTY')}
              className={`px-2.5 py-0.5 rounded-full font-semibold cursor-pointer transition-colors ${
                selectedCategory === 'QTY'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'
              }`}
            >
              Quantity Adjustments
            </button>
            <button
              type="button"
              onClick={() => setSelectedCategory('STATUS')}
              className={`px-2.5 py-0.5 rounded-full font-semibold cursor-pointer transition-colors ${
                selectedCategory === 'STATUS'
                  ? 'bg-amber-600 text-white'
                  : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'
              }`}
            >
              Status / Cancellations
            </button>
          </div>
        </div>

        {/* Scrollable Timeline List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto mb-3 text-slate-400">
                <History className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-700">No modification records found</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {searchTerm || selectedCategory !== 'ALL'
                  ? 'No entries match your current search and filter criteria.'
                  : 'This data point has not been modified since the initial MRP schedule import.'}
              </p>
              {(searchTerm || selectedCategory !== 'ALL' || filter) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedCategory('ALL');
                    if (onClearFilter) onClearFilter();
                  }}
                  className="mt-3 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold cursor-pointer shadow-2xs"
                >
                  Clear Filters & Show All
                </button>
              )}
            </div>
          ) : (
            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {filteredLogs.map((log) => {
                const isDateChange = log.fieldChanged.toLowerCase().includes('date') || log.fieldChanged.toLowerCase().includes('arrival');
                const isQtyChange = log.fieldChanged.toLowerCase().includes('qty') || log.fieldChanged.toLowerCase().includes('quantity');
                const isCancel = log.fieldChanged.toLowerCase().includes('cancel') || String(log.newValue).includes('CANCEL');

                return (
                  <div key={log.id} className="relative group">
                    {/* Timeline Node Icon */}
                    <div
                      className={`absolute -left-6 top-1.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-transform group-hover:scale-110 shadow-2xs ${
                        isCancel
                          ? 'bg-rose-500 border-white text-white'
                          : isDateChange
                          ? 'bg-indigo-600 border-white text-white'
                          : isQtyChange
                          ? 'bg-emerald-600 border-white text-white'
                          : 'bg-slate-700 border-white text-white'
                      }`}
                    >
                      {isCancel ? (
                        <AlertTriangle className="w-2.5 h-2.5" />
                      ) : isDateChange ? (
                        <Calendar className="w-2.5 h-2.5" />
                      ) : isQtyChange ? (
                        <Layers className="w-2.5 h-2.5" />
                      ) : (
                        <Clock className="w-2.5 h-2.5" />
                      )}
                    </div>

                    {/* Change Card */}
                    <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-2xs hover:shadow-xs transition-shadow space-y-2.5">
                      {/* Card Header: Timestamp & Author */}
                      <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-900 text-xs flex items-center gap-1">
                              <User className="w-3.5 h-3.5 text-slate-400" />
                              <span>{log.changedBy}</span>
                            </span>
                            <span className="text-[10px] text-slate-400">•</span>
                            <span className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-400" />
                              <span>{log.changedAt}</span>
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                            <span className="font-mono font-semibold text-slate-700">{log.poNumber}</span>
                            <span>•</span>
                            <span className="font-mono text-slate-600">{log.componentCode}</span>
                            {log.vendorName && <span>• {log.vendorName}</span>}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {/* Field Tag Badge */}
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              isCancel
                                ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                : isDateChange
                                ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                : isQtyChange
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : 'bg-slate-100 text-slate-800 border border-slate-200'
                            }`}
                          >
                            {log.fieldChanged.split(';')[0] || log.fieldChanged}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleCopyLog(log)}
                            className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 cursor-pointer"
                            title="Copy log entry to clipboard"
                          >
                            {copiedId === log.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Previous vs. Current Values Side-by-Side Comparison */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {/* Previous Value */}
                        <div className="bg-rose-50/70 border border-rose-200 rounded p-2 text-rose-950 space-y-1">
                          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-rose-800">
                            <span>Previous Value</span>
                            <span className="text-rose-500 font-normal">Before</span>
                          </div>
                          <div className="font-mono font-semibold text-rose-900 text-xs break-words">
                            {String(log.oldValue)}
                          </div>
                        </div>

                        {/* Current Value */}
                        <div className="bg-emerald-50/80 border border-emerald-200 rounded p-2 text-emerald-950 space-y-1">
                          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                            <span>Current Value</span>
                            <span className="text-emerald-600 font-normal">After</span>
                          </div>
                          <div className="font-mono font-bold text-emerald-900 text-xs break-words">
                            {String(log.newValue)}
                          </div>
                        </div>
                      </div>

                      {/* Reason for Change Callout */}
                      {log.reasonForChange && (
                        <div className="bg-slate-50 border-l-3 border-indigo-500 px-2.5 py-1.5 rounded-r text-xs text-slate-700">
                          <span className="font-semibold text-slate-900 text-[10px] uppercase tracking-wider block">
                            Justification / Reason for Modification:
                          </span>
                          <span className="italic text-slate-800 mt-0.5 block">
                            "{log.reasonForChange}"
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="p-3 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span className="text-[11px]">Audit records are immutable and cryptographically logged for traceability.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-semibold cursor-pointer"
          >
            Close History
          </button>
        </div>
      </div>
    </div>
  );
};
