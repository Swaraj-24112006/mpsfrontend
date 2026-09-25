import React, { useState, useEffect, useCallback } from 'react';
import {
  Boxes,
  Plus,
  Search,
  Download,
  Edit2,
  Trash2,
  AlertCircle,
  Loader2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  XCircle,
  X,
  Factory,
  Layers,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import fgHeaderService, {
  FGHeaderDTO,
  FGHeaderCreatePayload,
  FGHeaderUpdatePayload
} from '../../services/fgHeaderService';
import { ApiError } from '../../services/api';

export const FGHeaderManager: React.FC = () => {
  // --- API State ---
  const [data, setData] = useState<FGHeaderDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHeader, setEditingHeader] = useState<FGHeaderDTO | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    fg_code: '',
    fg_description: '',
    mini_factory: 'MF-1',
    line: 'Line-1',
    customer_segment: 'OEM',
    unit_price_inr: 0,
    active_bom_version: 'v1',
    uom: 'PC',
    is_active: true,
  });

  // Auto-dismiss messages
  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => setSuccessMsg(null), 4000);
      return () => clearTimeout(t);
    }
  }, [successMsg]);

  useEffect(() => {
    if (warningMsg) {
      const t = setTimeout(() => setWarningMsg(null), 8000);
      return () => clearTimeout(t);
    }
  }, [warningMsg]);

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(null), 8000);
      return () => clearTimeout(t);
    }
  }, [error]);

  const fetchHeaders = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const filters: Record<string, string> = { page: String(page) };
      if (searchTerm.trim()) filters.search = searchTerm.trim();
      if (statusFilter === 'ACTIVE') filters.is_active = 'true';
      if (statusFilter === 'INACTIVE') filters.is_active = 'false';

      const res = await fgHeaderService.list(filters);
      setData(res.results);
      setTotalCount(res.count);
      setCurrentPage(res.current_page || page);
      setTotalPages(res.total_pages || 1);
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      setError(apiErr.message || 'Failed to fetch Finished Goods headers from backend.');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    fetchHeaders(1);
  }, [searchTerm, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenModal = (item?: FGHeaderDTO) => {
    if (item) {
      setEditingHeader(item);
      setFormData({
        fg_code: item.fg_code,
        fg_description: item.fg_description,
        mini_factory: item.mini_factory || 'MF-1',
        line: item.line || 'Line-1',
        customer_segment: item.customer_segment || 'OEM',
        unit_price_inr: Number(item.unit_price_inr) || 0,
        active_bom_version: item.active_bom_version || 'v1',
        uom: item.uom || 'PC',
        is_active: item.is_active,
      });
    } else {
      setEditingHeader(null);
      setFormData({
        fg_code: '7',
        fg_description: '',
        mini_factory: 'MF-1',
        line: 'Line-1',
        customer_segment: 'OEM',
        unit_price_inr: 0,
        active_bom_version: 'v1',
        uom: 'PC',
        is_active: true,
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fg_code.trim()) {
      setError('FG Code is required.');
      return;
    }
    if (!formData.fg_code.trim().startsWith('7')) {
      setError('Finished Good code MUST start with prefix "7".');
      return;
    }
    if (!formData.fg_description.trim()) {
      setError('FG Description is required.');
      return;
    }
    if (formData.unit_price_inr < 0) {
      setError('Unit price cannot be negative.');
      return;
    }

    setSaving(true);
    setError(null);
    setWarningMsg(null);
    try {
      if (editingHeader) {
        const payload: FGHeaderUpdatePayload = {
          fg_description: formData.fg_description.trim(),
          mini_factory: formData.mini_factory,
          line: formData.line,
          customer_segment: formData.customer_segment,
          unit_price_inr: formData.unit_price_inr,
          active_bom_version: formData.active_bom_version.trim(),
          uom: formData.uom.trim(),
          is_active: formData.is_active,
        };

        const res = await fgHeaderService.update(editingHeader.fg_code, payload);
        if (res.warning) {
          setWarningMsg(res.warning);
        }
        setSuccessMsg(`FG Header ${editingHeader.fg_code} updated successfully.`);
      } else {
        const payload: FGHeaderCreatePayload = {
          fg_code: formData.fg_code.trim().toUpperCase(),
          fg_description: formData.fg_description.trim(),
          mini_factory: formData.mini_factory,
          line: formData.line,
          customer_segment: formData.customer_segment,
          unit_price_inr: formData.unit_price_inr,
          active_bom_version: formData.active_bom_version.trim() || 'v1',
          uom: formData.uom.trim() || 'PC',
          is_active: formData.is_active,
        };

        await fgHeaderService.create(payload);
        setSuccessMsg(`Finished Good ${payload.fg_code} created successfully.`);
      }

      setIsModalOpen(false);
      await fetchHeaders(currentPage);
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      if (apiErr.detail) {
        if (typeof apiErr.detail === 'string') {
          setError(apiErr.detail);
        } else {
          const detailMsg = Object.entries(apiErr.detail)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
            .join(' | ');
          setError(detailMsg);
        }
      } else {
        setError(apiErr.message || 'Failed to save Finished Good header.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (header: FGHeaderDTO) => {
    if (!window.confirm(`Delete Finished Good "${header.fg_code} - ${header.fg_description}"?`)) {
      return;
    }
    setError(null);
    try {
      await fgHeaderService.delete(header.fg_code);
      setSuccessMsg(`Finished Good ${header.fg_code} deleted successfully.`);
      await fetchHeaders(currentPage);
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      if (apiErr.status === 409) {
        setError(
          apiErr.message ||
            `Cannot delete FG '${header.fg_code}' because active monthly plan rows reference this finished good.`
        );
      } else {
        setError(apiErr.message || 'Failed to delete Finished Good header.');
      }
    }
  };

  const handleExportCSV = async () => {
    try {
      setLoading(true);
      const allHeaders = await fgHeaderService.listAll();
      const headers = [
        'FG Code',
        'FG Description',
        'Active BOM Version',
        'UOM',
        'Is Active'
      ];
      const rows = allHeaders.map((h) => [
        `"${h.fg_code}"`,
        `"${h.fg_description.replace(/"/g, '""')}"`,
        `"${h.active_bom_version}"`,
        `"${h.uom}"`,
        h.is_active ? 'Active' : 'Inactive'
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `FG_Header_Master_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      setSuccessMsg(`Exported ${allHeaders.length} FG Headers to CSV.`);
    } catch (err) {
      setError('Failed to export FG Header CSV.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Alert Notifications */}
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

      {warningMsg && (
        <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-600" />
            <span>{warningMsg}</span>
          </div>
          <button onClick={() => setWarningMsg(null)} className="text-amber-400 hover:text-amber-700">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-700">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
            <Boxes className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Finished Goods (FG) Header Master</h1>
            <p className="text-sm text-slate-500">
              Manage parent finished goods, active BOM versions, and operational status
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchHeaders(currentPage)}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            title="Refresh FG headers from database"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            Refresh
          </button>

          <button
            onClick={handleExportCSV}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-slate-50 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-slate-500" />
            Export CSV
          </button>

          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Finished Good
          </button>
        </div>
      </div>

      {/* Toolbar / Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 min-w-[280px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search FG code (7...), description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                statusFilter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter('ACTIVE')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                statusFilter === 'ACTIVE'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setStatusFilter('INACTIVE')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                statusFilter === 'INACTIVE'
                  ? 'bg-white text-rose-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Inactive
            </button>
          </div>
        </div>

        <div className="text-xs font-medium text-slate-500 flex items-center gap-2">
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />}
          <span>
            Total <strong className="text-slate-900">{totalCount}</strong> Finished Goods registered
          </span>
        </div>
      </div>

      {/* FG Headers Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">FG Code</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4 text-center">Active BOM Version</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading && data.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                    Loading Finished Goods headers...
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">
                    <Boxes className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    No Finished Goods found matching your filter criteria.
                  </td>
                </tr>
              ) : (
                data.map((item) => (
                  <tr
                    key={item.fg_code}
                    className={`hover:bg-blue-50/40 transition-colors ${!item.is_active ? 'opacity-60 bg-slate-50/60' : ''}`}
                  >
                    <td className="py-3 px-4 font-mono font-bold text-blue-700">
                      {item.fg_code}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900 max-w-md truncate">
                      {item.fg_description}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {item.active_bom_version}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                          item.is_active
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {item.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleOpenModal(item)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit Finished Good"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(item)}
                          className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete Finished Good"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-slate-200 text-sm text-slate-600">
            <div>
              Page <strong className="text-slate-900">{currentPage}</strong> of{' '}
              <strong className="text-slate-900">{totalPages}</strong> ({totalCount} total)
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchHeaders(currentPage - 1)}
                disabled={currentPage <= 1 || loading}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <button
                onClick={() => fetchHeaders(currentPage + 1)}
                disabled={currentPage >= totalPages || loading}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Boxes className="w-5 h-5 text-blue-600" />
                {editingHeader ? `Edit FG Header: ${editingHeader.fg_code}` : 'Add Finished Good (FG Header)'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    FG Code * (Prefix 7)
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!!editingHeader}
                    value={formData.fg_code}
                    onChange={(e) => setFormData({ ...formData, fg_code: e.target.value })}
                    placeholder="700101"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                  <div className="text-[10px] text-slate-400 mt-0.5">Must start with '7'</div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Active BOM Version *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.active_bom_version}
                    onChange={(e) => setFormData({ ...formData, active_bom_version: e.target.value })}
                    placeholder="v1"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                  {editingHeader && formData.active_bom_version !== editingHeader.active_bom_version && (
                    <div className="text-[10px] text-amber-600 font-medium mt-0.5">
                      ⚠️ Changing BOM version alters MRP calculations
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  FG Description *
                </label>
                <input
                  type="text"
                  required
                  value={formData.fg_description}
                  onChange={(e) => setFormData({ ...formData, fg_description: e.target.value })}
                  placeholder="e.g. Brake Caliper Assembly Front LH"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Unit of Measure (UOM)
                </label>
                <input
                  type="text"
                  value={formData.uom}
                  onChange={(e) => setFormData({ ...formData, uom: e.target.value })}
                  placeholder="PC / SET"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer pt-2">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  />
                  <span className="text-xs font-medium text-slate-700">
                    Finished Good is Active in Master Schedule
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingHeader ? 'Save Changes' : 'Create FG Header'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FGHeaderManager;
