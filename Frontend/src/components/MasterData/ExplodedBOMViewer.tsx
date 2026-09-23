import React, { useState, useEffect } from 'react';
import {
  GitFork,
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
  UserCheck,
  Clock,
  ShieldAlert,
  ArrowRight,
  TrendingDown,
  XCircle
} from 'lucide-react';
import bomService, { ExplodedBOMResponse, ExplodedComponent } from '../../services/bomService';
import fgHeaderService, { FGHeaderDTO } from '../../services/fgHeaderService';
import { ApiError } from '../../services/api';

export const ExplodedBOMViewer: React.FC = () => {
  const [fgHeaders, setFgHeaders] = useState<FGHeaderDTO[]>([]);
  const [selectedFgCode, setSelectedFgCode] = useState<string>('');
  const [explodedData, setExplodedData] = useState<ExplodedBOMResponse | null>(null);
  const [loadingHeaders, setLoadingHeaders] = useState(false);
  const [loadingExplosion, setLoadingExplosion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Load FG list on mount
  useEffect(() => {
    setLoadingHeaders(true);
    fgHeaderService.listAll()
      .then((headers) => {
        setFgHeaders(headers);
        if (headers.length > 0) {
          setSelectedFgCode(headers[0].fg_code);
        }
      })
      .catch((err) => {
        const apiErr = err as ApiError;
        setError(apiErr.message || 'Failed to load Finished Goods list.');
      })
      .finally(() => setLoadingHeaders(false));
  }, []);

  // Fetch Exploded BOM when selected FG changes
  useEffect(() => {
    if (!selectedFgCode) return;
    setLoadingExplosion(true);
    setError(null);
    bomService.getExplodedBOM(selectedFgCode)
      .then((data) => {
        setExplodedData(data);
      })
      .catch((err) => {
        const apiErr = err as ApiError;
        setError(apiErr.message || `Failed to explode BOM for Finished Good ${selectedFgCode}.`);
        setExplodedData(null);
      })
      .finally(() => setLoadingExplosion(false));
  }, [selectedFgCode]);

  const filteredComponents = explodedData
    ? explodedData.components.filter(
        (c) =>
          c.component_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.component_description.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (c.vendor_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (c.buyer_name || '').toLowerCase().includes(searchTerm.toLowerCase())
      )
    : [];

  // Summary calculations
  const totalComponents = explodedData?.components_count || 0;
  const criticalCount = explodedData?.components.filter((c) => c.current_stock < c.qty * 10).length || 0;
  const minCoverUnits = explodedData && explodedData.components.length > 0
    ? Math.min(...explodedData.components.map((c) => c.stock_covers_units))
    : 0;

  const handleExportCSV = () => {
    if (!explodedData) return;
    const headers = [
      'FG Code',
      'FG Description',
      'Component Code',
      'Component Description',
      'Category',
      'Role',
      'Qty Per Unit',
      'UOM',
      'Current Stock',
      'Stock Covers Units',
      'Supplier Vendor',
      'Assigned Buyer',
      'Lead Time Days',
      'Common Part?'
    ];
    const rows = explodedData.components.map((c) => [
      `"${explodedData.fg_code}"`,
      `"${explodedData.fg_description.replace(/"/g, '""')}"`,
      `"${c.component_code}"`,
      `"${c.component_description.replace(/"/g, '""')}"`,
      `"${c.category}"`,
      `"${c.component_role || ''}"`,
      c.qty,
      `"${c.uom}"`,
      c.current_stock,
      c.stock_covers_units,
      `"${(c.vendor_name || '').replace(/"/g, '""')}"`,
      `"${(c.buyer_name || '').replace(/"/g, '""')}"`,
      c.lead_time_days,
      c.is_common_part ? 'Yes' : 'No'
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Exploded_BOM_${explodedData.fg_code}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* Alert */}
      {error && (
        <div className="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-700">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
            <GitFork className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Exploded BOM & Stock Trace Viewer</h1>
            <p className="text-sm text-slate-500">
              Live multi-table join across BOM Master, Components, Suppliers, Buyers, and On-Hand Inventory
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (selectedFgCode) {
                setLoadingExplosion(true);
                bomService.getExplodedBOM(selectedFgCode)
                  .then(setExplodedData)
                  .finally(() => setLoadingExplosion(false));
              }
            }}
            disabled={loadingExplosion || !selectedFgCode}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            title="Refresh exploded BOM"
          >
            <RefreshCw className={`w-4 h-4 ${loadingExplosion ? 'animate-spin text-indigo-600' : ''}`} />
            Refresh
          </button>

          <button
            onClick={handleExportCSV}
            disabled={!explodedData || explodedData.components.length === 0}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-slate-50 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-slate-500" />
            Export Exploded CSV
          </button>
        </div>
      </div>

      {/* Selector & KPI Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Selector Card */}
        <div className="lg:col-span-2 bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Boxes className="w-4 h-4 text-indigo-600" />
              Select Finished Good (FG Code)
            </label>
            <div className="relative">
              <select
                value={selectedFgCode}
                onChange={(e) => setSelectedFgCode(e.target.value)}
                disabled={loadingHeaders}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                {loadingHeaders ? (
                  <option>Loading Finished Goods...</option>
                ) : fgHeaders.length === 0 ? (
                  <option>No Finished Goods found</option>
                ) : (
                  fgHeaders.map((fg) => (
                    <option key={fg.fg_code} value={fg.fg_code}>
                      {fg.fg_code} — {fg.fg_description} ({fg.active_bom_version})
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {explodedData && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>BOM Version: <strong className="text-indigo-700 font-mono">{explodedData.active_bom_version}</strong></span>
              <span>Unique Line Items: <strong className="text-slate-900">{explodedData.components_count}</strong></span>
            </div>
          )}
        </div>

        {/* Max Buildable Units KPI */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Boxes className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Max Units Buildable Now</div>
            <div className="text-2xl font-bold font-mono text-slate-900 mt-0.5">
              {loadingExplosion ? '...' : Math.floor(minCoverUnits).toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400">Bottlenecked by lowest stock part</div>
          </div>
        </div>

        {/* Potential Shortages KPI */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
            criticalCount > 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
          }`}>
            {criticalCount > 0 ? <AlertTriangle className="w-6 h-6" /> : <CheckCircle2 className="w-6 h-6" />}
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Low Stock Components</div>
            <div className={`text-2xl font-bold font-mono mt-0.5 ${criticalCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {loadingExplosion ? '...' : criticalCount}
            </div>
            <div className="text-[11px] text-slate-400">Covers &lt;10 build units</div>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search component, supplier, or buyer in this BOM..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <div className="text-xs text-slate-500">
          Showing <strong className="text-slate-900">{filteredComponents.length}</strong> of{' '}
          <strong className="text-slate-900">{totalComponents}</strong> parts
        </div>
      </div>

      {/* Exploded Tree Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Component</th>
                <th className="py-3 px-4">Description & Role</th>
                <th className="py-3 px-4 text-center">Category</th>
                <th className="py-3 px-4 text-right">Usage / FG</th>
                <th className="py-3 px-4 text-right">On-Hand Stock</th>
                <th className="py-3 px-4 text-right">Stock Covers (Units)</th>
                <th className="py-3 px-4">Supplier / Vendor</th>
                <th className="py-3 px-4">Assigned Buyer</th>
                <th className="py-3 px-4 text-center">Lead Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loadingExplosion ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
                    Calculating multi-join exploded BOM and stock coverage...
                  </td>
                </tr>
              ) : filteredComponents.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <GitFork className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    No components mapped in BOM for Finished Good <strong>{selectedFgCode}</strong>.
                  </td>
                </tr>
              ) : (
                filteredComponents.map((item) => {
                  const isBottleneck = item.stock_covers_units <= minCoverUnits + 0.001;
                  return (
                    <tr
                      key={item.component_code}
                      className={`hover:bg-indigo-50/30 transition-colors ${
                        isBottleneck ? 'bg-amber-50/50' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-slate-900 flex items-center gap-1.5">
                          {item.component_code}
                          {item.is_common_part && (
                            <span
                              className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200"
                              title={`Shared in ${item.shared_in_fgs_count} Finished Goods`}
                            >
                              Common ({item.shared_in_fgs_count})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900 max-w-xs truncate">
                          {item.component_description}
                        </div>
                        {item.component_role && (
                          <div className="text-xs text-slate-500 italic mt-0.5">{item.component_role}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                            item.category === 'PM'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}
                        >
                          {item.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900">
                        {item.qty} {item.uom}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-700">
                        {item.current_stock.toLocaleString()} {item.uom}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 font-mono font-bold">
                          {isBottleneck && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-sans font-bold uppercase">
                              Bottleneck
                            </span>
                          )}
                          <span
                            className={
                              item.stock_covers_units < 10
                                ? 'text-rose-600 font-extrabold'
                                : 'text-slate-900'
                            }
                          >
                            {Math.floor(item.stock_covers_units).toLocaleString()} units
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {item.vendor_name ? (
                          <div>
                            <div className="font-medium text-slate-900 text-xs">{item.vendor_name}</div>
                            <div className="text-[11px] font-mono text-slate-400">{item.vendor_code}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">No supplier mapped</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {item.buyer_name ? (
                          <div className="text-xs text-slate-800 flex items-center gap-1">
                            <UserCheck className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            <span>{item.buyer_name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-slate-700">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {item.lead_time_days}d
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ExplodedBOMViewer;
