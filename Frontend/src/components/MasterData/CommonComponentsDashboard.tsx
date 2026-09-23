import React, { useState, useEffect } from 'react';
import {
  Share2,
  Search,
  Download,
  AlertCircle,
  Loader2,
  RefreshCw,
  Boxes,
  Package,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Building2,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
  Info
} from 'lucide-react';
import bomService, { CommonComponentItem } from '../../services/bomService';
import { ApiError } from '../../services/api';

export const CommonComponentsDashboard: React.FC = () => {
  const [data, setData] = useState<CommonComponentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'RM' | 'PM'>('ALL');
  const [expandedCode, setExpandedCode] = useState<string | null>(null);

  const fetchCommonComponents = async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await bomService.getCommonComponents();
      setData(items);
      if (items.length > 0 && !expandedCode) {
        setExpandedCode(items[0].component_code);
      }
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      setError(apiErr.message || 'Failed to fetch common components data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCommonComponents();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredItems = data.filter((c) => {
    const matchesSearch =
      c.component_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.component_description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.consuming_fgs.some(
        (fg) =>
          fg.fg_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
          fg.fg_description.toLowerCase().includes(searchTerm.toLowerCase())
      );
    const matchesCategory = categoryFilter === 'ALL' || c.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  // KPI calculations
  const totalCommonParts = data.length;
  const criticalCommonCount = data.filter((c) => c.is_critical).length;
  const maxShared = data.length > 0 ? Math.max(...data.map((c) => c.shared_in_fgs_count)) : 0;

  const handleExportCSV = () => {
    const headers = [
      'Component Code',
      'Component Description',
      'Category',
      'UOM',
      'Shared in FGs Count',
      'Safety Stock',
      'Is Critical',
      'Consuming FG Codes',
      'Consuming FG Descriptions'
    ];
    const rows = filteredItems.map((c) => [
      `"${c.component_code}"`,
      `"${c.component_description.replace(/"/g, '""')}"`,
      `"${c.category}"`,
      `"${c.uom}"`,
      c.shared_in_fgs_count,
      c.safety_stock,
      c.is_critical ? 'Yes' : 'No',
      `"${c.consuming_fgs.map((fg) => fg.fg_code).join('; ')}"`,
      `"${c.consuming_fgs.map((fg) => fg.fg_description.replace(/"/g, '""')).join('; ')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Common_Components_Matrix_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* Error Alert */}
      {error && (
        <div className="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-700">
            ✕
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600">
            <Share2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Common Components Matrix</h1>
            <p className="text-sm text-slate-500">
              Cross-model parts shared between 2 or more Finished Goods — high supply impact & disruption risk
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchCommonComponents}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            title="Refresh common components"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-purple-600' : ''}`} />
            Refresh
          </button>

          <button
            onClick={handleExportCSV}
            disabled={filteredItems.length === 0}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-slate-50 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-slate-500" />
            Export Matrix CSV
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Share2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Total Common Components</div>
            <div className="text-2xl font-bold font-mono text-slate-900 mt-0.5">
              {loading ? '...' : totalCommonParts}
            </div>
            <div className="text-[11px] text-slate-400">Shared in multiple BOMs</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Critical Shared Parts</div>
            <div className="text-2xl font-bold font-mono text-rose-600 mt-0.5">
              {loading ? '...' : criticalCommonCount}
            </div>
            <div className="text-[11px] text-slate-400">Can halt multiple assembly lines</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Maximum Share Breadth</div>
            <div className="text-2xl font-bold font-mono text-blue-600 mt-0.5">
              {loading ? '...' : `${maxShared} FGs`}
            </div>
            <div className="text-[11px] text-slate-400">Single part consumed by {maxShared} FGs</div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 min-w-[280px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search component code, description, or consuming FG..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setCategoryFilter('ALL')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                categoryFilter === 'ALL'
                  ? 'bg-white text-purple-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Types
            </button>
            <button
              onClick={() => setCategoryFilter('RM')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                categoryFilter === 'RM'
                  ? 'bg-white text-purple-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Raw Material (RM)
            </button>
            <button
              onClick={() => setCategoryFilter('PM')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                categoryFilter === 'PM'
                  ? 'bg-white text-purple-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Packaging (PM)
            </button>
          </div>
        </div>

        <div className="text-xs text-slate-500">
          Showing <strong className="text-slate-900">{filteredItems.length}</strong> common parts
        </div>
      </div>

      {/* Grid of Common Components */}
      {loading && data.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-slate-200">
          <Loader2 className="w-8 h-8 text-purple-600 animate-spin mb-3" />
          <p className="text-sm text-slate-500 font-medium">Scanning Bills of Materials for shared components...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-slate-200 text-center">
          <Share2 className="w-12 h-12 text-slate-300 mb-3" />
          <h3 className="text-base font-semibold text-slate-800">No common components found</h3>
          <p className="text-xs text-slate-500 max-w-sm mt-1">
            Common components are parts that appear in 2 or more Finished Good Bills of Materials.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredItems.map((comp) => {
            const isExpanded = expandedCode === comp.component_code;
            return (
              <div
                key={comp.component_code}
                className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden hover:border-purple-300 transition-all"
              >
                {/* Header Row */}
                <div
                  onClick={() => setExpandedCode(isExpanded ? null : comp.component_code)}
                  className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/80 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-700 font-mono font-bold flex items-center justify-center text-xs border border-purple-200 shrink-0">
                      {comp.component_code}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-900 text-sm">{comp.component_description}</h3>
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-semibold ${
                            comp.category === 'PM'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}
                        >
                          {comp.category}
                        </span>
                        {comp.is_critical && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-bold uppercase">
                            Critical
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-3 mt-1">
                        <span>UOM: <strong className="font-mono text-slate-700">{comp.uom}</strong></span>
                        <span>• Safety Stock: <strong className="font-mono text-slate-700">{comp.safety_stock}</strong></span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold flex items-center gap-1.5">
                      <Boxes className="w-3.5 h-3.5" />
                      Shared in <strong>{comp.shared_in_fgs_count}</strong> Finished Goods
                    </div>
                    <span className="text-xs text-purple-600 font-medium">
                      {isExpanded ? 'Hide FGs ▲' : 'Show FGs ▼'}
                    </span>
                  </div>
                </div>

                {/* Expanded Consuming FGs Detail */}
                {isExpanded && (
                  <div className="px-5 pb-5 pt-2 bg-slate-50/50 border-t border-slate-100">
                    <div className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                      <Boxes className="w-3.5 h-3.5 text-indigo-600" />
                      Consuming Finished Goods ({comp.consuming_fgs.length} models)
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {comp.consuming_fgs.map((fg) => (
                        <div
                          key={`${fg.fg_code}-${fg.bom_version}`}
                          className="bg-white p-3 rounded-lg border border-slate-200 text-xs shadow-xs flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between font-mono font-bold text-slate-900">
                              <span>{fg.fg_code}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-normal">
                                {fg.bom_version}
                              </span>
                            </div>
                            <div className="text-slate-600 mt-1 line-clamp-1">{fg.fg_description}</div>
                          </div>
                          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                            <span>Per Unit Usage:</span>
                            <span className="font-mono font-bold text-indigo-700">
                              {fg.qty} {fg.uom}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CommonComponentsDashboard;
