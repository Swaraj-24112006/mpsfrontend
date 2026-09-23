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
  Package,
  Layers,
  AlertTriangle,
  CheckCircle2,
  Share2,
  ShieldAlert,
  Archive
} from 'lucide-react';
import componentService, {
  ComponentDTO,
  ComponentCreatePayload,
  ComponentUpdatePayload
} from '../../services/componentService';
import { ApiError } from '../../services/api';

export const ComponentManager: React.FC = () => {
  // --- API State ---
  const [data, setData] = useState<ComponentDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'RM' | 'PM'>('ALL');
  const [commonFilter, setCommonFilter] = useState<'ALL' | 'COMMON' | 'SINGLE'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingComponent, setEditingComponent] = useState<ComponentDTO | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    component_code: '',
    component_description: '',
    category: 'RM' as 'RM' | 'PM',
    uom: 'PC',
    default_storage_location: 'SL01',
    safety_stock: 0,
    is_critical: false,
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
    if (error) {
      const t = setTimeout(() => setError(null), 8000);
      return () => clearTimeout(t);
    }
  }, [error]);

  const fetchComponents = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const filters: Record<string, string> = { page: String(page) };
      if (searchTerm.trim()) filters.search = searchTerm.trim();
      if (categoryFilter !== 'ALL') filters.category = categoryFilter;
      if (commonFilter === 'COMMON') filters.is_common_part = 'true';
      if (commonFilter === 'SINGLE') filters.is_common_part = 'false';
      if (statusFilter === 'ACTIVE') filters.is_active = 'true';
      if (statusFilter === 'INACTIVE') filters.is_active = 'false';

      const res = await componentService.list(filters);
      setData(res.results);
      setTotalCount(res.count);
      setCurrentPage(res.current_page || page);
      setTotalPages(res.total_pages || 1);
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      setError(apiErr.message || 'Failed to fetch RM/PM components from backend.');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, categoryFilter, commonFilter, statusFilter]);

  useEffect(() => {
    fetchComponents(1);
  }, [searchTerm, categoryFilter, commonFilter, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenModal = (item?: ComponentDTO) => {
    if (item) {
      setEditingComponent(item);
      setFormData({
        component_code: item.component_code,
        component_description: item.component_description,
        category: item.category || 'RM',
        uom: item.uom || 'PC',
        default_storage_location: item.default_storage_location || 'SL01',
        safety_stock: Number(item.safety_stock) || 0,
        is_critical: item.is_critical,
        is_active: item.is_active,
      });
    } else {
      setEditingComponent(null);
      setFormData({
        component_code: '',
        component_description: '',
        category: 'RM',
        uom: 'PC',
        default_storage_location: 'SL01',
        safety_stock: 0,
        is_critical: false,
        is_active: true,
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.component_code.trim()) {
      setError('Component Code is required.');
      return;
    }
    if (formData.component_code.trim().startsWith('7')) {
      setError("Component code cannot start with '7' (prefix '7' is reserved for Finished Goods).");
      return;
    }
    if (!formData.component_description.trim()) {
      setError('Component Description is required.');
      return;
    }
    if (formData.safety_stock < 0) {
      setError('Safety stock cannot be negative.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (editingComponent) {
        const payload: ComponentUpdatePayload = {
          component_description: formData.component_description.trim(),
          category: formData.category,
          uom: formData.uom.trim(),
          default_storage_location: formData.default_storage_location.trim(),
          safety_stock: formData.safety_stock,
          is_critical: formData.is_critical,
          is_active: formData.is_active,
        };

        await componentService.update(editingComponent.component_code, payload);
        setSuccessMsg(`Component ${editingComponent.component_code} updated successfully.`);
      } else {
        const payload: ComponentCreatePayload = {
          component_code: formData.component_code.trim().toUpperCase(),
          component_description: formData.component_description.trim(),
          category: formData.category,
          uom: formData.uom.trim() || 'PC',
          default_storage_location: formData.default_storage_location.trim() || 'SL01',
          safety_stock: formData.safety_stock,
          is_critical: formData.is_critical,
          is_active: formData.is_active,
        };

        await componentService.create(payload);
        setSuccessMsg(`Component ${payload.component_code} created successfully.`);
      }

      setIsModalOpen(false);
      await fetchComponents(currentPage);
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
        setError(apiErr.message || 'Failed to save RM/PM component.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (comp: ComponentDTO) => {
    if (!window.confirm(`Delete Component "${comp.component_code} - ${comp.component_description}"?`)) {
      return;
    }
    setError(null);
    try {
      await componentService.delete(comp.component_code);
      setSuccessMsg(`Component ${comp.component_code} deleted successfully.`);
      await fetchComponents(currentPage);
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      if (apiErr.status === 409) {
        setError(
          apiErr.message ||
            `Cannot delete Component '${comp.component_code}' because it is actively referenced by one or more Bills of Materials (BOM).`
        );
      } else {
        setError(apiErr.message || 'Failed to delete component.');
      }
    }
  };

  const handleExportCSV = async () => {
    try {
      setLoading(true);
      const allComps = await componentService.listAll();
      const headers = [
        'Component Code',
        'Component Description',
        'Category',
        'UOM',
        'Storage Location',
        'Safety Stock',
        'Is Critical',
        'Is Common Part',
        'Shared in FGs Count',
        'Is Active'
      ];
      const rows = allComps.map((c) => [
        `"${c.component_code}"`,
        `"${c.component_description.replace(/"/g, '""')}"`,
        `"${c.category}"`,
        `"${c.uom}"`,
        `"${c.default_storage_location}"`,
        c.safety_stock,
        c.is_critical ? 'Yes' : 'No',
        c.is_common_part ? 'Yes' : 'No',
        c.shared_in_fgs_count,
        c.is_active ? 'Active' : 'Inactive'
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Component_Master_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      setSuccessMsg(`Exported ${allComps.length} Components to CSV.`);
    } catch (err) {
      setError('Failed to export Component Master CSV.');
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
          <div className="w-10 h-10 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-600">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">RM & PM Component Master</h1>
            <p className="text-sm text-slate-500">
              Master catalog for Raw Materials & Packaging items, storage locations, safety stocks, and common part links
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchComponents(currentPage)}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            title="Refresh components from database"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-teal-600' : ''}`} />
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
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Component
          </button>
        </div>
      </div>

      {/* Toolbar / Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search component code, description, location..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setCategoryFilter('ALL')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                categoryFilter === 'ALL'
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Types
            </button>
            <button
              onClick={() => setCategoryFilter('RM')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                categoryFilter === 'RM'
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              RM
            </button>
            <button
              onClick={() => setCategoryFilter('PM')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                categoryFilter === 'PM'
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              PM
            </button>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setCommonFilter('ALL')}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                commonFilter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Usages
            </button>
            <button
              onClick={() => setCommonFilter('COMMON')}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                commonFilter === 'COMMON'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Parts consumed by 2 or more Finished Goods"
            >
              Common Parts
            </button>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                statusFilter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter('ACTIVE')}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                statusFilter === 'ACTIVE'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setStatusFilter('INACTIVE')}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
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
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />}
          <span>
            Total <strong className="text-slate-900">{totalCount}</strong> Components registered
          </span>
        </div>
      </div>

      {/* Components Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Component Code</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4 text-center">Category</th>
                <th className="py-3 px-4 text-center">UOM</th>
                <th className="py-3 px-4">Storage Location</th>
                <th className="py-3 px-4 text-right">Safety Stock</th>
                <th className="py-3 px-4 text-center">Common Part?</th>
                <th className="py-3 px-4 text-center">Critical</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading && data.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-600" />
                    Loading RM/PM components...
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-500">
                    <Package className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    No components found matching your filter criteria.
                  </td>
                </tr>
              ) : (
                data.map((item) => (
                  <tr
                    key={item.component_code}
                    className={`hover:bg-teal-50/40 transition-colors ${!item.is_active ? 'opacity-60 bg-slate-50/60' : ''}`}
                  >
                    <td className="py-3 px-4 font-mono font-bold text-teal-700">
                      {item.component_code}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900 max-w-xs truncate">
                      {item.component_description}
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
                    <td className="py-3 px-4 text-center font-mono text-xs text-slate-600">
                      {item.uom}
                    </td>
                    <td className="py-3 px-4 text-slate-700 font-mono text-xs">
                      {item.default_storage_location}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900">
                      {Number(item.safety_stock).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {item.is_common_part ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <Share2 className="w-3 h-3" />
                          Shared in {item.shared_in_fgs_count} FGs
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 font-medium">Single FG</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {item.is_critical ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                          <ShieldAlert className="w-3 h-3" />
                          Critical
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Standard</span>
                      )}
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
                          className="p-1.5 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                          title="Edit Component"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(item)}
                          className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete Component"
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
                onClick={() => fetchComponents(currentPage - 1)}
                disabled={currentPage <= 1 || loading}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <button
                onClick={() => fetchComponents(currentPage + 1)}
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
                <Package className="w-5 h-5 text-teal-600" />
                {editingComponent ? `Edit Component: ${editingComponent.component_code}` : 'Add RM/PM Component'}
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
                    Component Code *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!!editingComponent}
                    value={formData.component_code}
                    onChange={(e) => setFormData({ ...formData, component_code: e.target.value })}
                    placeholder="e.g. 100201"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 font-mono disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                  <div className="text-[10px] text-slate-400 mt-0.5">Cannot start with '7'</div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Category *
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as 'RM' | 'PM' })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 bg-white"
                  >
                    <option value="RM">Raw Material (RM)</option>
                    <option value="PM">Packaging Material (PM)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Component Description *
                </label>
                <input
                  type="text"
                  required
                  value={formData.component_description}
                  onChange={(e) => setFormData({ ...formData, component_description: e.target.value })}
                  placeholder="e.g. Aluminum Housing Casting 6061-T6"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    UOM
                  </label>
                  <input
                    type="text"
                    value={formData.uom}
                    onChange={(e) => setFormData({ ...formData, uom: e.target.value })}
                    placeholder="PC / KG"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Storage Location
                  </label>
                  <input
                    type="text"
                    value={formData.default_storage_location}
                    onChange={(e) => setFormData({ ...formData, default_storage_location: e.target.value })}
                    placeholder="SL01"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Safety Stock
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.safety_stock}
                    onChange={(e) => setFormData({ ...formData, safety_stock: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_critical}
                    onChange={(e) => setFormData({ ...formData, is_critical: e.target.checked })}
                    className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
                  />
                  <span className="text-xs font-medium text-slate-700">
                    Critical Part (Triggers line stop if depleted)
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
                  />
                  <span className="text-xs font-medium text-slate-700">
                    Active Component
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
                  className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingComponent ? 'Save Changes' : 'Create Component'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComponentManager;
