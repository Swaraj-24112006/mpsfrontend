import React, { useState, useEffect, useCallback } from 'react';
import {
  Layers,
  Plus,
  Search,
  Download,
  UploadCloud,
  FileSpreadsheet,
  Edit2,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  XCircle,
  X,
  Package,
  Sparkles
} from 'lucide-react';
import { BOMItem } from '../../types';
import bomService, {
  BOMLineDTO,
  BOMLineCreatePayload,
  BOMLineUpdatePayload,
  BOMUploadResponse
} from '../../services/bomService';
import fgHeaderService, { FGHeaderDTO } from '../../services/fgHeaderService';
import componentService, { ComponentDTO } from '../../services/componentService';
import { ApiError } from '../../services/api';

interface BOMMasterManagerProps {
  boms: BOMItem[];
  onUpdateBOMs?: (boms: BOMItem[]) => void;
  onUpdateBoms?: (boms: BOMItem[]) => void;
}

/** Convert backend DTO to the frontend BOMItem shape used by other components */
function dtoToFrontend(dto: BOMLineDTO): BOMItem {
  return {
    id: String(dto.id),
    fgCode: dto.fg_code,
    fgDescription: dto.fg_description,
    componentCode: dto.component_code,
    componentDescription: dto.component_description,
    qty: dto.qty,
    uom: dto.uom,
    category: dto.category as 'RM' | 'PM',
  };
}

export const BOMMasterManager: React.FC<BOMMasterManagerProps> = ({
  boms,
  onUpdateBOMs,
  onUpdateBoms,
}) => {
  const syncBoms = onUpdateBOMs || onUpdateBoms;

  // --- API State ---
  const [apiData, setApiData] = useState<BOMLineDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Dropdown options (from API)
  const [fgOptions, setFgOptions] = useState<FGHeaderDTO[]>([]);
  const [componentOptions, setComponentOptions] = useState<ComponentDTO[]>([]);

  // --- Filter State ---
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'RM' | 'PM'>('ALL');
  const [selectedFGFilter, setSelectedFGFilter] = useState<string>('ALL');
  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingBOM, setEditingBOM] = useState<BOMLineDTO | null>(null);

  // CSV Upload State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<BOMUploadResponse | null>(null);

  // Form state (uses backend field names)
  const [formData, setFormData] = useState({
    fg_code: '',
    component_code: '',
    qty: 1.0,
    uom: 'PC',
    component_role: '',
    bom_version: 'v1',
    is_active: true,
    lead_time_days_override: null as number | null,
  });

  // Inline Quick-Create State for FG and Component
  const [fgMode, setFgMode] = useState<'existing' | 'new'>('existing');
  const [newFgData, setNewFgData] = useState({
    fg_code: '',
    fg_description: '',
    mini_factory: '',
    line: '',
    unit_price_inr: 1000,
  });

  const [componentMode, setComponentMode] = useState<'existing' | 'new'>('existing');
  const [newComponentData, setNewComponentData] = useState({
    component_code: '',
    component_description: '',
    category: 'RM' as 'RM' | 'PM',
    safety_stock: 0,
  });

  // --- Auto-dismiss messages ---
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

  // --- Load dropdown options on mount ---
  useEffect(() => {
    fgHeaderService.listAll()
      .then(setFgOptions)
      .catch(() => { /* dropdown will be empty; non-fatal */ });

    componentService.listAll()
      .then(setComponentOptions)
      .catch(() => { /* dropdown will be empty; non-fatal */ });
  }, []);

  // --- Fetch BOM list from API ---
  const fetchBOMs = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const filters: Record<string, string> = { page: String(page) };
      if (searchTerm) filters.search = searchTerm;
      if (categoryFilter !== 'ALL') filters.category = categoryFilter;
      if (selectedFGFilter !== 'ALL') filters.fg_code = selectedFGFilter;

      const res = await bomService.list(filters);
      setApiData(res.results);
      setCurrentPage(res.current_page);
      setTotalPages(res.total_pages);
      setTotalCount(res.count);

      // Sync backend data to parent state so other components stay updated
      if (syncBoms) {
        const allItems = await bomService.listAll();
        syncBoms(allItems.map(dtoToFrontend));
      }
    } catch (err) {
      const apiErr = err as ApiError;
      // If backend is unreachable, fall back to existing prop data
      if (apiErr.status === undefined) {
        setError('Backend unreachable — showing cached data. Start the MPS backend on port 8000.');
      } else {
        setError(apiErr.message || 'Failed to fetch BOM data');
      }
    } finally {
      setLoading(false);
    }
  }, [searchTerm, categoryFilter, selectedFGFilter, syncBoms]);

  // Trigger fetch on mount and when filters change
  useEffect(() => {
    fetchBOMs(1);
  }, [searchTerm, categoryFilter, selectedFGFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Determine display data: API data if available, else fallback to props ---
  const displayData: { id: string; fgCode: string; fgDescription: string; componentCode: string; componentDescription: string; qty: number; uom: string; category: 'RM' | 'PM' }[] =
    apiData.length > 0 || !error
      ? apiData.map(dtoToFrontend)
      : boms.filter((bom) => {
          const matchesSearch =
            bom.fgCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
            bom.fgDescription.toLowerCase().includes(searchTerm.toLowerCase()) ||
            bom.componentCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
            bom.componentDescription.toLowerCase().includes(searchTerm.toLowerCase());
          const matchesCategory = categoryFilter === 'ALL' || bom.category === categoryFilter;
          const matchesFG = selectedFGFilter === 'ALL' || bom.fgCode === selectedFGFilter;
          return matchesSearch && matchesCategory && matchesFG;
        });

  // Unique FGs for dropdown (from API options if available, else from display data)
  const uniqueFGs: { code: string; desc: string }[] =
    fgOptions.length > 0
      ? fgOptions.map(fg => ({ code: fg.fg_code, desc: fg.fg_description }))
      : Array.from(
          new Map<string, { code: string; desc: string }>(
            boms.map((b) => [b.fgCode, { code: b.fgCode, desc: b.fgDescription }])
          ).values()
        );

  // --- Modal handlers ---
  const handleOpenAddModal = (existing?: BOMLineDTO) => {
    setError(null);
    setFgMode('existing');
    setComponentMode('existing');
    setNewFgData({
      fg_code: '',
      fg_description: '',
      mini_factory: '',
      line: '',
      unit_price_inr: 1000,
    });
    setNewComponentData({
      component_code: '',
      component_description: '',
      category: 'RM',
      safety_stock: 0,
    });

    if (existing) {
      setEditingBOM(existing);
      setFormData({
        fg_code: existing.fg_code,
        component_code: existing.component_code,
        qty: existing.qty,
        uom: existing.uom,
        component_role: existing.component_role || '',
        bom_version: existing.bom_version || 'v1',
        is_active: existing.is_active,
        lead_time_days_override: existing.lead_time_days_override,
      });
    } else {
      setEditingBOM(null);
      setFormData({
        fg_code: '',
        component_code: '',
        qty: 1.0,
        uom: 'PC',
        component_role: '',
        bom_version: 'v1',
        is_active: true,
        lead_time_days_override: null,
      });
    }
    setIsAddModalOpen(true);
  };

  const handleSaveBOM = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.qty <= 0) {
      setError('Quantity must be greater than 0.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (editingBOM) {
        const payload: BOMLineUpdatePayload = {
          fg_code: formData.fg_code,
          component_code: formData.component_code,
          qty: formData.qty,
          uom: formData.uom,
          component_role: formData.component_role || undefined,
          bom_version: formData.bom_version,
          is_active: formData.is_active,
          lead_time_days_override: formData.lead_time_days_override,
        };
        await bomService.update(editingBOM.id, payload);
        setSuccessMsg('BOM item updated successfully.');
      } else {
        let finalFgCode = formData.fg_code;
        let finalComponentCode = formData.component_code;

        // 1. Process New Finished Good if in 'new' mode
        if (fgMode === 'new') {
          const code = newFgData.fg_code.trim();
          const desc = newFgData.fg_description.trim();
          if (!code) {
            setError('Please enter a Finished Good part number.');
            setSaving(false);
            return;
          }
          if (!code.startsWith('7')) {
            setError("SAP Rule Violation: Finished Good part number must start with '7' (e.g. 7.06496.04.0).");
            setSaving(false);
            return;
          }
          if (!desc) {
            setError('Please enter a description for the new Finished Good.');
            setSaving(false);
            return;
          }

          // Check if FG already exists in catalog
          const existingFg = fgOptions.find(f => f.fg_code === code);
          if (!existingFg) {
            await fgHeaderService.create({
              fg_code: code,
              fg_description: desc,
              mini_factory: newFgData.mini_factory.trim() || undefined,
              line: newFgData.line.trim() || undefined,
              unit_price_inr: newFgData.unit_price_inr || 1000,
              active_bom_version: formData.bom_version || 'v1',
              uom: formData.uom || 'PC',
              is_active: true,
            });
            const updatedFgs = await fgHeaderService.listAll();
            setFgOptions(updatedFgs);
          }
          finalFgCode = code;
        }

        // 2. Process New Component if in 'new' mode
        if (componentMode === 'new') {
          const compCode = newComponentData.component_code.trim();
          const compDesc = newComponentData.component_description.trim();
          if (!compCode) {
            setError('Please enter a Component part number.');
            setSaving(false);
            return;
          }
          if (compCode.startsWith('7')) {
            setError("SAP Rule Violation: Component part numbers cannot start with '7' (codes starting with '7' are reserved for Finished Goods).");
            setSaving(false);
            return;
          }
          if (!compDesc) {
            setError('Please enter a description for the new Component.');
            setSaving(false);
            return;
          }

          // Check if Component already exists in catalog
          const existingComp = componentOptions.find(c => c.component_code === compCode);
          if (!existingComp) {
            await componentService.create({
              component_code: compCode,
              component_description: compDesc,
              category: newComponentData.category,
              uom: formData.uom || 'PC',
              safety_stock: newComponentData.safety_stock || 0,
              is_critical: false,
              is_active: true,
            });
            const updatedComps = await componentService.listAll();
            setComponentOptions(updatedComps);
          }
          finalComponentCode = compCode;
        }

        if (!finalFgCode || !finalComponentCode) {
          setError('Please specify both an FG code and a Component code.');
          setSaving(false);
          return;
        }

        const payload: BOMLineCreatePayload = {
          fg_code: finalFgCode,
          component_code: finalComponentCode,
          qty: formData.qty,
          uom: formData.uom,
          component_role: formData.component_role || undefined,
          bom_version: formData.bom_version || 'v1',
          is_active: formData.is_active,
          lead_time_days_override: formData.lead_time_days_override,
        };
        await bomService.create(payload);
        setSuccessMsg(`BOM relationship created successfully (${finalFgCode} → ${finalComponentCode}).`);
      }
      setIsAddModalOpen(false);
      fetchBOMs(currentPage);
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      setError(apiErr.message || 'Failed to save BOM item.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBOM = async (id: number) => {
    if (!window.confirm('Are you sure you want to remove this BOM component relationship?')) return;

    setSaving(true);
    setError(null);
    try {
      await bomService.delete(id);
      setSuccessMsg('BOM item deleted successfully.');
      fetchBOMs(currentPage);
    } catch (err) {
      const apiErr = err as ApiError;
      setError(apiErr.message || 'Failed to delete BOM item.');
    } finally {
      setSaving(false);
    }
  };

  const handleExportCSV = () => {
    const headers = [
      'FG Code', 'FG Description', 'Component Code', 'Component Description',
      'Quantity Per Unit', 'UOM', 'Category', 'BOM Version', 'Component Role'
    ];
    const rows = displayData.map((b) => [
      `"${b.fgCode}"`, `"${b.fgDescription}"`, `"${b.componentCode}"`,
      `"${b.componentDescription}"`, b.qty, `"${b.uom}"`, `"${b.category}"`
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `BOM_Master_Export_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const handleDownloadTemplate = () => {
    const headers = ['FG Code', 'FG Description', 'Component Code', 'Component Description', 'Quantity Per Unit', 'UOM', 'Category'];
    const sampleRows = [
      '7.06496.03.0,"15W-40 DIESEL OIL 5L CAN",1.02345.01.0,"5L HDPE CAN BLOW MOLDED",1.000,PC,PM',
      '7.06496.03.0,"15W-40 DIESEL OIL 5L CAN",1.02345.02.0,"38MM INDUCTION SEAL CAP",1.000,PC,PM',
      '7.06496.03.0,"15W-40 DIESEL OIL 5L CAN",2.01234.05.0,"VIRGIN BASE OIL GROUP II",4.250,L,RM',
      '7.06496.03.0,"15W-40 DIESEL OIL 5L CAN",3.05678.01.0,"MULTI-GRADE HEAVY DUTY ADDITIVE",0.750,KG,RM',
    ];
    const csvContent = [headers.join(','), ...sampleRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'BOM_Master_Upload_Template.csv';
    link.click();
  };

  const handleUploadCSV = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setError('Please choose a valid CSV file to upload.');
      return;
    }
    setUploading(true);
    setUploadResult(null);
    setError(null);
    try {
      const res = await bomService.uploadCSV(uploadFile);
      setUploadResult(res);
      setSuccessMsg(res.message);
      // Refresh BOM records, FG options, and component options
      fetchBOMs(1);
      fgHeaderService.listAll().then(setFgOptions).catch(() => {});
      componentService.listAll().then(setComponentOptions).catch(() => {});
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      setError(apiErr.message || 'Failed to upload BOM CSV.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Messages */}
      {successMsg && (
        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800 animate-in fade-in slide-in-from-top-2">
          <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
          {successMsg}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          <XCircle className="w-4 h-4 text-red-500 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600"><XCircle className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">BOM Master (Bill of Materials)</h1>
              <p className="text-sm text-slate-500">
                Maintains multi-level relationship between Finished Goods (part prefix 7) and RM/PM components
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchBOMs(currentPage)}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-slate-50 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            id="export-bom-csv"
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-slate-50 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <Download className="w-4 h-4 text-slate-500" />
            Export CSV
          </button>
          <button
            id="upload-bom-csv"
            onClick={() => {
              setUploadFile(null);
              setUploadResult(null);
              setIsUploadModalOpen(true);
            }}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors shadow-sm"
          >
            <UploadCloud className="w-4 h-4 text-blue-600" />
            Upload CSV
          </button>
          <button
            id="add-bom-btn"
            onClick={() => handleOpenAddModal()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add BOM Item
          </button>
        </div>
      </div>

      {/* SAP Rule Notice Card */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex items-start gap-3 text-sm text-slate-700">
        <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-semibold text-slate-900">SAP Data Standard:</span> Finished Good (FG) part numbers start with <code className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded font-mono font-bold">7</code> (e.g. 7.06496.03.0). Components starting with other numbers or prefixes are treated as Raw Materials (RM) or Packaging Materials (PM).
        </div>
      </div>

      {/* Filter and Search Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="bom-search-input"
              type="text"
              placeholder="Search FG code, component, description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <select
            id="bom-fg-filter"
            value={selectedFGFilter}
            onChange={(e) => setSelectedFGFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">All Finished Goods ({uniqueFGs.length})</option>
            {uniqueFGs.map((fg) => (
              <option key={fg.code} value={fg.code}>
                {fg.code} - {fg.desc}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setCategoryFilter('ALL')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                categoryFilter === 'ALL'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Types
            </button>
            <button
              onClick={() => setCategoryFilter('RM')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                categoryFilter === 'RM'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Raw Material (RM)
            </button>
            <button
              onClick={() => setCategoryFilter('PM')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                categoryFilter === 'PM'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Packaging (PM)
            </button>
          </div>
        </div>

        <div className="text-xs font-medium text-slate-500">
          {loading ? (
            <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Loading...</span>
          ) : (
            <>Showing <span className="text-slate-900 font-bold">{displayData.length}</span> of {totalCount || boms.length} BOM relations</>
          )}
        </div>
      </div>

      {/* BOM Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading && apiData.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-500" />
            <p className="text-sm font-medium">Loading BOM data from server...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider font-semibold">
                  <th className="py-3.5 px-4">Finished Good (FG)</th>
                  <th className="py-3.5 px-4">Component Code</th>
                  <th className="py-3.5 px-4">Component Description</th>
                  <th className="py-3.5 px-4 text-center">Category</th>
                  <th className="py-3.5 px-4 text-right">Usage / FG</th>
                  <th className="py-3.5 px-4 text-center">UOM</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {displayData.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No BOM records matching your search or filters.
                    </td>
                  </tr>
                ) : (
                  displayData.map((bom) => (
                    <tr key={bom.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded font-mono text-xs border border-blue-200 font-bold">
                            {bom.fgCode}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">{bom.fgDescription}</div>
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-slate-800">
                        {bom.componentCode}
                      </td>
                      <td className="py-3 px-4 text-slate-700 font-medium">
                        {bom.componentDescription}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                            bom.category === 'PM'
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {bom.category || 'RM'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900 font-mono">
                        {bom.qty}
                      </td>
                      <td className="py-3 px-4 text-center text-xs font-medium text-slate-500">
                        {bom.uom}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              const dto = apiData.find(d => String(d.id) === bom.id);
                              if (dto) handleOpenAddModal(dto);
                            }}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Edit BOM item"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteBOM(Number(bom.id))}
                            disabled={saving}
                            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                            title="Delete BOM item"
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
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50 text-sm">
            <span className="text-slate-600">
              Page <span className="font-bold text-slate-900">{currentPage}</span> of {totalPages} ({totalCount} total)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchBOMs(currentPage - 1)}
                disabled={currentPage <= 1 || loading}
                className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Previous
              </button>
              <button
                onClick={() => fetchBOMs(currentPage + 1)}
                disabled={currentPage >= totalPages || loading}
                className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 border border-slate-200 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {editingBOM ? 'Edit BOM Item' : 'Add New BOM Item'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {editingBOM ? 'Modify usage quantity and line attributes' : 'Link Finished Goods with RM/PM components'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!editingBOM && (
              <div className="mt-3 bg-blue-50/70 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">On-The-Fly Master Data:</span> You can either select existing parts from dropdowns or toggle to <strong>+ Create New</strong> to define a brand new Finished Good or Component right here without leaving this page!
                </div>
              </div>
            )}

            <form onSubmit={handleSaveBOM} className="mt-4 space-y-4">
              {/* Finished Good Section */}
              <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-blue-600" />
                    Finished Good (Parent) *
                  </label>
                  {!editingBOM && (
                    <div className="flex items-center bg-slate-200/80 p-0.5 rounded-lg text-[11px] font-semibold">
                      <button
                        type="button"
                        onClick={() => setFgMode('existing')}
                        className={`px-2.5 py-1 rounded-md transition-colors ${
                          fgMode === 'existing'
                            ? 'bg-white text-blue-700 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Select Existing
                      </button>
                      <button
                        type="button"
                        onClick={() => setFgMode('new')}
                        className={`px-2.5 py-1 rounded-md transition-colors ${
                          fgMode === 'new'
                            ? 'bg-white text-blue-700 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        + Create New FG
                      </button>
                    </div>
                  )}
                </div>

                {fgMode === 'existing' || editingBOM ? (
                  <div>
                    <select
                      required
                      disabled={!!editingBOM}
                      value={formData.fg_code}
                      onChange={(e) => setFormData({ ...formData, fg_code: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono bg-white disabled:bg-slate-100"
                    >
                      <option value="">-- Select Existing FG ({fgOptions.length}) --</option>
                      {fgOptions.map((fg) => (
                        <option key={fg.fg_code} value={fg.fg_code}>
                          {fg.fg_code} — {fg.fg_description}
                        </option>
                      ))}
                    </select>
                    {formData.fg_code && (
                      <p className="text-[11px] text-slate-500 mt-1 font-mono">
                        {fgOptions.find(f => f.fg_code === formData.fg_code)?.fg_description}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 pt-1 animate-in fade-in">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          New FG Code * (Starts with 7)
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. 7.06496.04.0"
                          value={newFgData.fg_code}
                          onChange={(e) => setNewFgData({ ...newFgData, fg_code: e.target.value })}
                          className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Mini Factory / Line
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. MF-1 / Line-A"
                          value={newFgData.mini_factory}
                          onChange={(e) => setNewFgData({ ...newFgData, mini_factory: e.target.value })}
                          className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        FG Description *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. 20W-50 SYNTHETIC MOTOR OIL 5L"
                        value={newFgData.fg_description}
                        onChange={(e) => setNewFgData({ ...newFgData, fg_description: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Component Section */}
              <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-purple-600" />
                    Component (Child Part) *
                  </label>
                  {!editingBOM && (
                    <div className="flex items-center bg-slate-200/80 p-0.5 rounded-lg text-[11px] font-semibold">
                      <button
                        type="button"
                        onClick={() => setComponentMode('existing')}
                        className={`px-2.5 py-1 rounded-md transition-colors ${
                          componentMode === 'existing'
                            ? 'bg-white text-purple-700 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Select Existing
                      </button>
                      <button
                        type="button"
                        onClick={() => setComponentMode('new')}
                        className={`px-2.5 py-1 rounded-md transition-colors ${
                          componentMode === 'new'
                            ? 'bg-white text-purple-700 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        + Create New Component
                      </button>
                    </div>
                  )}
                </div>

                {componentMode === 'existing' || editingBOM ? (
                  <div>
                    <select
                      required
                      disabled={!!editingBOM}
                      value={formData.component_code}
                      onChange={(e) => setFormData({ ...formData, component_code: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono bg-white disabled:bg-slate-100"
                    >
                      <option value="">-- Select Existing Component ({componentOptions.length}) --</option>
                      {componentOptions.map((comp) => (
                        <option key={comp.component_code} value={comp.component_code}>
                          {comp.component_code} — {comp.component_description} ({comp.category})
                        </option>
                      ))}
                    </select>
                    {formData.component_code && (
                      <p className="text-[11px] text-slate-500 mt-1">
                        {componentOptions.find(c => c.component_code === formData.component_code)?.component_description}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 pt-1 animate-in fade-in">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          New Component Code * (Cannot start with 7)
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. 1.09999.01.0 or RM-101"
                          value={newComponentData.component_code}
                          onChange={(e) => setNewComponentData({ ...newComponentData, component_code: e.target.value })}
                          className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Category *
                        </label>
                        <div className="flex items-center gap-3 mt-1.5">
                          <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                            <input
                              type="radio"
                              name="new_comp_cat"
                              value="RM"
                              checked={newComponentData.category === 'RM'}
                              onChange={() => setNewComponentData({ ...newComponentData, category: 'RM' })}
                              className="text-blue-600 focus:ring-blue-500"
                            />
                            Raw Material (RM)
                          </label>
                          <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                            <input
                              type="radio"
                              name="new_comp_cat"
                              value="PM"
                              checked={newComponentData.category === 'PM'}
                              onChange={() => setNewComponentData({ ...newComponentData, category: 'PM' })}
                              className="text-blue-600 focus:ring-blue-500"
                            />
                            Packaging (PM)
                          </label>
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Component Description *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. 5L HDPE BLOW MOLDED CANISTER"
                        value={newComponentData.component_description}
                        onChange={(e) => setNewComponentData({ ...newComponentData, component_description: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Usage & Attributes */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Quantity per FG *
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    required
                    value={formData.qty}
                    onChange={(e) => setFormData({ ...formData, qty: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    UOM *
                  </label>
                  <select
                    value={formData.uom}
                    onChange={(e) => setFormData({ ...formData, uom: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="PC">PC (Pieces)</option>
                    <option value="SET">SET</option>
                    <option value="KG">KG (Kilograms)</option>
                    <option value="MTR">MTR (Meters)</option>
                    <option value="LTR">LTR (Liters)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    BOM Version
                  </label>
                  <input
                    type="text"
                    value={formData.bom_version}
                    onChange={(e) => setFormData({ ...formData, bom_version: e.target.value })}
                    placeholder="e.g. v1"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Component Role
                  </label>
                  <input
                    type="text"
                    value={formData.component_role}
                    onChange={(e) => setFormData({ ...formData, component_role: e.target.value })}
                    placeholder="e.g. PRIMARY, ALTERNATE"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Lead Time Override (days)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.lead_time_days_override ?? ''}
                    onChange={(e) => setFormData({ ...formData, lead_time_days_override: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="Vendor default"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="bom-is-active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <label htmlFor="bom-is-active" className="text-xs text-slate-700 font-medium">Active BOM line</label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {editingBOM ? 'Save Changes' : 'Create BOM Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Upload Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Upload BOM Master CSV</h3>
                  <p className="text-xs text-slate-500">Bulk upload Finished Goods and component bill of materials</p>
                </div>
              </div>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadCSV} className="mt-4 space-y-4">
              {/* Automated Ingestion Notice */}
              <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 text-xs text-blue-900 leading-relaxed">
                <div className="flex items-center gap-1.5 font-bold mb-1 text-blue-950">
                  <CheckCircle2 className="w-4 h-4 text-blue-600" />
                  Automated Data Ingestion & Cascading:
                </div>
                <ul className="list-disc list-inside space-y-1 text-blue-800">
                  <li><strong>FG Headers Tab:</strong> Finished Goods (code starting with 7) are automatically created or updated.</li>
                  <li><strong>RM/PM Components Tab:</strong> Component codes are automatically registered as RM or PM.</li>
                  <li><strong>Common Matrix Tab:</strong> Multi-FG sharing is instantly recalculated across the entire factory.</li>
                  <li><strong>Exploded BOM Tab:</strong> Live explosion trees with stock coverage are immediately available.</li>
                </ul>
              </div>

              {/* Template Download Prompt */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Required: <strong>FG Code, FG Description, Component Code, Component Description, Quantity Per Unit, UOM, Category</strong></span>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="text-blue-600 hover:text-blue-800 font-semibold underline underline-offset-2 shrink-0 ml-2"
                >
                  Download Template
                </button>
              </div>

              {/* File Dropzone */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Select CSV File
                </label>
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-5 text-center hover:border-blue-500 transition-colors bg-slate-50/50">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setUploadFile(e.target.files[0]);
                        setUploadResult(null);
                      }
                    }}
                    className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                  />
                  {uploadFile && (
                    <div className="mt-2 text-xs font-medium text-slate-700">
                      Selected: <span className="font-mono text-blue-600">{uploadFile.name}</span> ({(uploadFile.size / 1024).toFixed(1)} KB)
                    </div>
                  )}
                </div>
              </div>

              {/* Upload Result / Report */}
              {uploadResult && (
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-emerald-700 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Upload Complete (Batch #{uploadResult.batch_id})
                    </span>
                    <span className="text-slate-500">Status: {uploadResult.status}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 bg-white rounded-lg border border-slate-200">
                      <div className="text-slate-400">Total Rows</div>
                      <div className="text-sm font-bold text-slate-800">{uploadResult.total_rows}</div>
                    </div>
                    <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-200">
                      <div className="text-emerald-600">Imported</div>
                      <div className="text-sm font-bold text-emerald-800">{uploadResult.imported_rows}</div>
                    </div>
                    <div className="p-2 bg-amber-50 rounded-lg border border-amber-200">
                      <div className="text-amber-600">Skipped</div>
                      <div className="text-sm font-bold text-amber-800">{uploadResult.skipped_rows}</div>
                    </div>
                  </div>
                  {uploadResult.errors && uploadResult.errors.length > 0 && (
                    <div className="mt-2 p-2 bg-red-50 rounded-lg border border-red-200 text-xs text-red-800 max-h-28 overflow-y-auto space-y-1">
                      <div className="font-bold text-red-900">Issues detected ({uploadResult.errors.length}):</div>
                      {uploadResult.errors.map((e, idx) => (
                        <div key={idx} className="font-mono text-[11px] leading-tight">• {e}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  {uploadResult ? 'Close' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={uploading || !uploadFile}
                  className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg shadow-sm transition-colors"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Processing Ingestion...
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-3.5 h-3.5" />
                      Upload & Ingest BOM
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
