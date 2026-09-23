import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Building2,
  Plus,
  Search,
  Download,
  Edit2,
  Trash2,
  UserCheck,
  Clock,
  PackageCheck,
  Mail,
  Phone,
  AlertCircle,
  Loader2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  XCircle,
  X,
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2
} from 'lucide-react';
import { VendorBuyerItem } from '../../types';
import vendorBuyerService, {
  VendorBuyerDTO,
  VendorBuyerCreatePayload,
  VendorBuyerUpdatePayload,
  VendorBuyerUploadResponse
} from '../../services/vendorBuyerService';
import componentService, { ComponentDTO } from '../../services/componentService';
import { ApiError } from '../../services/api';

interface VendorBuyerManagerProps {
  vendorBuyers: VendorBuyerItem[];
  onUpdateVendorBuyers: (items: VendorBuyerItem[]) => void;
}

/** Convert backend DTO to the frontend VendorBuyerItem shape */
function dtoToFrontend(dto: VendorBuyerDTO): VendorBuyerItem {
  return {
    id: String(dto.id),
    vendorCode: dto.vendor_code,
    vendorName: dto.vendor_name,
    buyerName: dto.buyer_name,
    buyerEmail: dto.buyer_email || '',
    buyerPhone: dto.buyer_phone || '',
    category: dto.category || 'RM',
    suppliedComponents: dto.supplied_components || [],
    leadTimeDays: dto.lead_time_days || 7,
    city: dto.city || '',
    gstNo: dto.gst_no || '',
  };
}

export const VendorBuyerManager: React.FC<VendorBuyerManagerProps> = ({
  vendorBuyers,
  onUpdateVendorBuyers,
}) => {
  // --- API State ---
  const [apiData, setApiData] = useState<VendorBuyerDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Component options for picker
  const [componentOptions, setComponentOptions] = useState<ComponentDTO[]>([]);
  const [componentSearchTerm, setComponentSearchTerm] = useState('');

  // --- Filter State ---
  const [searchTerm, setSearchTerm] = useState('');
  const [buyerFilter, setBuyerFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'RM' | 'PM'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VendorBuyerDTO | null>(null);

  // CSV Upload State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<VendorBuyerUploadResponse | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    vendor_code: '',
    vendor_name: '',
    buyer_name: '',
    buyer_email: '',
    buyer_phone: '',
    category: 'RM' as 'RM' | 'PM',
    lead_time_days: 7,
    city: '',
    gst_no: '',
    is_active: true,
    supplied_components: [] as string[],
  });

  const [rawComponentsInput, setRawComponentsInput] = useState('');

  // --- Auto-dismiss alerts ---
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

  // --- Load component master options for picker on mount ---
  useEffect(() => {
    componentService.listAll()
      .then(setComponentOptions)
      .catch(() => { /* non-fatal fallback */ });
  }, []);

  // --- Fetch Vendor-Buyers from API ---
  const fetchVendorBuyers = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const filters: Record<string, string> = { page: String(page) };
      if (searchTerm.trim()) filters.search = searchTerm.trim();
      if (buyerFilter !== 'ALL') filters.buyer_name = buyerFilter;
      if (categoryFilter !== 'ALL') filters.category = categoryFilter;
      if (statusFilter === 'ACTIVE') filters.is_active = 'true';
      if (statusFilter === 'INACTIVE') filters.is_active = 'false';

      const res = await vendorBuyerService.list(filters);
      setApiData(res.results);
      setTotalCount(res.count);
      setCurrentPage(page);
      setTotalPages(Math.ceil(res.count / 50) || 1);

      // Keep parent app synchronized for other cockpit views
      if (res.results.length > 0) {
        onUpdateVendorBuyers(res.results.map(dtoToFrontend));
      }
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      if (apiErr.status === 0) {
        setError('Cannot connect to backend (is Django server running on port 8000?). Showing local data.');
      } else {
        setError(apiErr.message || 'Failed to fetch vendor-buyer data');
      }
    } finally {
      setLoading(false);
    }
  }, [searchTerm, buyerFilter, categoryFilter, statusFilter, onUpdateVendorBuyers]);

  useEffect(() => {
    fetchVendorBuyers(1);
  }, [searchTerm, buyerFilter, categoryFilter, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Display items: use API if available, else local prop fallback
  const displayItems = apiData.length > 0 || !error
    ? apiData
    : vendorBuyers
        .filter((item) => {
          const matchesSearch =
            item.vendorCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.vendorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.buyerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.suppliedComponents.some((c) => c.toLowerCase().includes(searchTerm.toLowerCase()));
          const matchesBuyer = buyerFilter === 'ALL' || item.buyerName === buyerFilter;
          const matchesCategory = categoryFilter === 'ALL' || item.category === categoryFilter;
          return matchesSearch && matchesBuyer && matchesCategory;
        })
        .map((item, idx) => ({
          id: idx + 1,
          vendor_code: item.vendorCode,
          vendor_name: item.vendorName,
          buyer_name: item.buyerName,
          buyer_email: item.buyerEmail || '',
          buyer_phone: item.buyerPhone || '',
          category: item.category,
          lead_time_days: item.leadTimeDays,
          city: item.city || '',
          gst_no: item.gstNo || '',
          is_active: true,
          supplied_components: item.suppliedComponents,
          created_at: '',
          updated_at: '',
        } as VendorBuyerDTO));

  // Extract unique buyers for dropdown
  const uniqueBuyers = Array.from(
    new Set([
      ...apiData.map((v) => v.buyer_name),
      ...vendorBuyers.map((v) => v.buyerName),
    ])
  ).filter(Boolean).sort();

  // --- Modal Handlers ---
  const handleOpenModal = (item?: VendorBuyerDTO) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        vendor_code: item.vendor_code,
        vendor_name: item.vendor_name,
        buyer_name: item.buyer_name,
        buyer_email: item.buyer_email || '',
        buyer_phone: item.buyer_phone || '',
        category: item.category,
        lead_time_days: item.lead_time_days,
        city: item.city || '',
        gst_no: item.gst_no || '',
        is_active: item.is_active,
        supplied_components: [...item.supplied_components],
      });
      setRawComponentsInput('');
    } else {
      setEditingItem(null);
      setFormData({
        vendor_code: 'V-',
        vendor_name: '',
        buyer_name: '',
        buyer_email: '',
        buyer_phone: '',
        category: 'RM',
        lead_time_days: 7,
        city: '',
        gst_no: '',
        is_active: true,
        supplied_components: [],
      });
      setRawComponentsInput('');
    }
    setComponentSearchTerm('');
    setIsAddModalOpen(true);
  };

  const handleAddComponentCode = (code: string) => {
    const clean = code.trim().toUpperCase();
    if (!clean) return;
    if (!formData.supplied_components.includes(clean)) {
      setFormData((prev) => ({
        ...prev,
        supplied_components: [...prev.supplied_components, clean],
      }));
    }
  };

  const handleRemoveComponentCode = (code: string) => {
    setFormData((prev) => ({
      ...prev,
      supplied_components: prev.supplied_components.filter((c) => c !== code),
    }));
  };

  const handleApplyRawComponents = () => {
    if (!rawComponentsInput.trim()) return;
    const codes = rawComponentsInput
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    const merged = Array.from(new Set([...formData.supplied_components, ...codes]));
    setFormData((prev) => ({ ...prev, supplied_components: merged }));
    setRawComponentsInput('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.vendor_code.trim()) {
      setError('Vendor Code is required.');
      return;
    }
    if (!formData.vendor_name.trim()) {
      setError('Vendor Name is required.');
      return;
    }
    if (!formData.buyer_name.trim()) {
      setError('Assigned Buyer Name is required.');
      return;
    }
    if (formData.supplied_components.length === 0) {
      setError('Please select or specify at least one supplied component.');
      return;
    }
    if (formData.lead_time_days <= 0) {
      setError('Lead time days must be greater than 0.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (editingItem) {
        const payload: VendorBuyerUpdatePayload = {
          vendor_name: formData.vendor_name.trim(),
          buyer_name: formData.buyer_name.trim(),
          buyer_email: formData.buyer_email.trim(),
          buyer_phone: formData.buyer_phone.trim(),
          category: formData.category,
          lead_time_days: formData.lead_time_days,
          city: formData.city.trim(),
          gst_no: formData.gst_no.trim(),
          is_active: formData.is_active,
          supplied_components: formData.supplied_components,
        };
        await vendorBuyerService.update(editingItem.id, payload);
        setSuccessMsg(`Vendor ${formData.vendor_code} updated successfully.`);
      } else {
        const payload: VendorBuyerCreatePayload = {
          vendor_code: formData.vendor_code.trim().toUpperCase(),
          vendor_name: formData.vendor_name.trim(),
          buyer_name: formData.buyer_name.trim(),
          buyer_email: formData.buyer_email.trim(),
          buyer_phone: formData.buyer_phone.trim(),
          category: formData.category,
          lead_time_days: formData.lead_time_days,
          city: formData.city.trim(),
          gst_no: formData.gst_no.trim(),
          is_active: formData.is_active,
          supplied_components: formData.supplied_components,
        };
        await vendorBuyerService.create(payload);
        setSuccessMsg(`Vendor ${payload.vendor_code} created successfully.`);
      }

      setIsAddModalOpen(false);
      await fetchVendorBuyers(currentPage);
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
        setError(apiErr.message || 'Failed to save vendor-buyer master.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: VendorBuyerDTO) => {
    if (!window.confirm(`Delete Vendor "${item.vendor_code} - ${item.vendor_name}"?`)) {
      return;
    }
    setError(null);
    try {
      await vendorBuyerService.delete(item.id);
      setSuccessMsg(`Vendor ${item.vendor_code} deleted successfully.`);
      await fetchVendorBuyers(currentPage);
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      if (apiErr.status === 409) {
        setError(
          apiErr.message ||
            `Cannot delete Vendor '${item.vendor_code}' because active delivery schedules or orders reference it.`
        );
      } else {
        setError(apiErr.message || 'Failed to delete vendor.');
      }
    }
  };

  const handleExportCSV = async () => {
    try {
      setLoading(true);
      // Fetch full set from backend without pagination
      const allVendors = await vendorBuyerService.listAll();
      const headers = [
        'Vendor Code',
        'Vendor Name',
        'Buyer Name',
        'Buyer Email',
        'Buyer Phone',
        'Category',
        'Lead Time (Days)',
        'City',
        'GST No',
        'Is Active',
        'Supplied Component Codes'
      ];
      const rows = allVendors.map((v) => [
        `"${v.vendor_code}"`,
        `"${v.vendor_name.replace(/"/g, '""')}"`,
        `"${v.buyer_name.replace(/"/g, '""')}"`,
        `"${v.buyer_email || ''}"`,
        `"${v.buyer_phone || ''}"`,
        `"${v.category}"`,
        v.lead_time_days,
        `"${(v.city || '').replace(/"/g, '""')}"`,
        `"${v.gst_no || ''}"`,
        v.is_active ? 'Active' : 'Inactive',
        `"${(v.supplied_components || []).join('; ')}"`
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Vendor_Buyer_Master_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      setSuccessMsg(`Exported ${allVendors.length} records to CSV.`);
    } catch (err) {
      setError('Failed to export vendor-buyer CSV.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const headers = [
      'Vendor Code',
      'Vendor Name',
      'Buyer Name',
      'Buyer Email',
      'Buyer Phone',
      'Category',
      'Lead Time (Days)',
      'City',
      'GST No',
      'Supplied Component Codes'
    ];
    const sampleRows = [
      'V-1001,"PLASTI-PACK INDUSTRIES","Arun Kumar",arun.k@acme.com,"+91 98765 43210",PM,7,"Pune","27AAACP1234A1Z5","1.02345.01.0; 1.02345.02.0"',
      'V-1002,"SUPREME PETROCHEM LTD","Neha Sharma",neha.s@acme.com,"+91 98765 43211",RM,14,"Mumbai","27AABCS5678B1Z2","2.01234.05.0"',
      'V-1003,"CHEM-TECH SPECIALTIES","Rajesh Patel",rajesh.p@acme.com,"+91 98765 43212",RM,10,"Vadodara","24AAACR1234F1Z3","3.05678.01.0"',
    ];
    const csvContent = [headers.join(','), ...sampleRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Vendor_Buyer_Upload_Template.csv';
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
      const res = await vendorBuyerService.uploadCSV(uploadFile);
      setUploadResult(res);
      setSuccessMsg(res.message);
      // Refresh vendor list
      fetchVendorBuyers(1);
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      setError(apiErr.message || 'Failed to upload Vendor & Buyer CSV.');
    } finally {
      setUploading(false);
    }
  };

  // Filter components for picker
  const filteredComponentOptions = componentOptions.filter(
    (c) =>
      c.component_code.toLowerCase().includes(componentSearchTerm.toLowerCase()) ||
      c.component_description.toLowerCase().includes(componentSearchTerm.toLowerCase())
  ).slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Toast / Alert Notifications */}
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
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-700">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Vendor & Buyer Relationship Master</h1>
            <p className="text-sm text-slate-500">
              Maps suppliers, assigned supply planners, procurement lead times, and supplied part codes
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchVendorBuyers(currentPage)}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            title="Refresh data from server"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-600' : ''}`} />
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
            id="upload-vendor-csv"
            onClick={() => {
              setUploadFile(null);
              setUploadResult(null);
              setIsUploadModalOpen(true);
            }}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors shadow-sm"
          >
            <UploadCloud className="w-4 h-4 text-amber-600" />
            Upload CSV
          </button>

          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Relationship
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search vendor code, name, buyer, city, part..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />
          </div>

          <select
            value={buyerFilter}
            onChange={(e) => setBuyerFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="ALL">All Buyers ({uniqueBuyers.length})</option>
            {uniqueBuyers.map((buyer) => (
              <option key={buyer} value={buyer}>
                {buyer}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setCategoryFilter('ALL')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                categoryFilter === 'ALL'
                  ? 'bg-white text-amber-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Types
            </button>
            <button
              onClick={() => setCategoryFilter('RM')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                categoryFilter === 'RM'
                  ? 'bg-white text-amber-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              RM
            </button>
            <button
              onClick={() => setCategoryFilter('PM')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                categoryFilter === 'PM'
                  ? 'bg-white text-amber-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              PM
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
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />}
          <span>
            Showing <strong className="text-slate-900">{displayItems.length}</strong> of{' '}
            <strong className="text-slate-900">{totalCount || displayItems.length}</strong> records
          </span>
        </div>
      </div>

      {/* Grid of Cards */}
      {loading && displayItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-slate-200">
          <Loader2 className="w-8 h-8 text-amber-600 animate-spin mb-3" />
          <p className="text-sm text-slate-500 font-medium">Loading vendor-buyer mappings from server...</p>
        </div>
      ) : displayItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-slate-200 text-center">
          <Users className="w-12 h-12 text-slate-300 mb-3" />
          <h3 className="text-base font-semibold text-slate-800">No vendor relationships found</h3>
          <p className="text-xs text-slate-500 max-w-sm mt-1">
            Try adjusting your search query, category filter, or add a new vendor relationship mapping.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {displayItems.map((item) => (
            <div
              key={item.id}
              className={`bg-white rounded-xl border p-5 shadow-sm hover:border-amber-300 transition-all flex flex-col justify-between ${
                !item.is_active ? 'opacity-70 bg-slate-50 border-slate-200' : 'border-slate-200'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-700 font-mono font-bold flex items-center justify-center text-xs border border-amber-200">
                      {item.vendor_code}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-900 text-sm">{item.vendor_name}</h3>
                        {!item.is_active && (
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                            Inactive
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-2">
                        <span>{item.city || 'Domestic Supplier'}</span>
                        {item.gst_no && <span className="font-mono text-[11px] text-slate-400">• GST: {item.gst_no}</span>}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-semibold ${
                      item.category === 'PM'
                        ? 'bg-purple-50 text-purple-700 border border-purple-200'
                        : 'bg-blue-50 text-blue-700 border border-blue-200'
                    }`}
                  >
                    {item.category}
                  </span>
                </div>

                {/* Buyer Assignment */}
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 my-3">
                  <div className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 mb-1">
                    <UserCheck className="w-3.5 h-3.5 text-amber-600" />
                    Assigned Buyer / Supply Planner
                  </div>
                  <div className="text-sm font-bold text-slate-900">{item.buyer_name}</div>
                  <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-500">
                    {item.buyer_email && (
                      <div className="flex items-center gap-1">
                        <Mail className="w-3 h-3 text-slate-400" />
                        <span>{item.buyer_email}</span>
                      </div>
                    )}
                    {item.buyer_phone && (
                      <div className="flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{item.buyer_phone}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Supplied Components */}
                <div className="mb-3">
                  <div className="text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1">
                    <PackageCheck className="w-3.5 h-3.5 text-slate-400" />
                    Supplied Part Numbers ({item.supplied_components.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {item.supplied_components.map((part) => (
                      <span
                        key={part}
                        className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded font-mono text-xs border border-slate-200 font-semibold"
                      >
                        {part}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between mt-2 text-xs text-slate-600">
                <div className="flex items-center gap-1.5 font-medium">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  Lead Time: <span className="font-bold text-slate-900">{item.lead_time_days} Days</span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenModal(item)}
                    className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                    title="Edit Vendor & Buyer"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(item)}
                    className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete Vendor"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-sm text-sm text-slate-600">
          <div>
            Page <strong className="text-slate-900">{currentPage}</strong> of{' '}
            <strong className="text-slate-900">{totalPages}</strong> ({totalCount} total vendors)
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchVendorBuyers(currentPage - 1)}
              disabled={currentPage <= 1 || loading}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            <button
              onClick={() => fetchVendorBuyers(currentPage + 1)}
              disabled={currentPage >= totalPages || loading}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full p-6 border border-slate-200 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-amber-600" />
                {editingItem ? `Edit Vendor: ${editingItem.vendor_code}` : 'Add Vendor & Buyer Relationship'}
              </h2>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Vendor Code *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!!editingItem}
                    value={formData.vendor_code}
                    onChange={(e) => setFormData({ ...formData, vendor_code: e.target.value })}
                    placeholder="e.g. V-1001"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-mono disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                  <div className="text-[10px] text-slate-400 mt-0.5">Unique vendor identifier code</div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Vendor Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.vendor_name}
                    onChange={(e) => setFormData({ ...formData, vendor_name: e.target.value })}
                    placeholder="e.g. Endurance Technologies Ltd"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Assigned Buyer Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.buyer_name}
                  onChange={(e) => setFormData({ ...formData, buyer_name: e.target.value })}
                  placeholder="e.g. Rajesh Kumar (Buyer - Castings)"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Buyer Email
                  </label>
                  <input
                    type="email"
                    value={formData.buyer_email}
                    onChange={(e) => setFormData({ ...formData, buyer_email: e.target.value })}
                    placeholder="e.g. rajesh.kumar@plant.com"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Buyer Phone
                  </label>
                  <input
                    type="tel"
                    value={formData.buyer_phone}
                    onChange={(e) => setFormData({ ...formData, buyer_phone: e.target.value })}
                    placeholder="e.g. +91 98765 43210"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Category *
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as 'RM' | 'PM' })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white"
                  >
                    <option value="RM">Raw Material (RM)</option>
                    <option value="PM">Packaging Material (PM)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Lead Time (Days) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.lead_time_days}
                    onChange={(e) => setFormData({ ...formData, lead_time_days: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Active Status
                  </label>
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                    />
                    <span className="text-xs text-slate-700 font-medium">Active Supplier</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    City / Plant Location
                  </label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="e.g. Pune, Maharashtra"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    GST No.
                  </label>
                  <input
                    type="text"
                    value={formData.gst_no}
                    onChange={(e) => setFormData({ ...formData, gst_no: e.target.value.toUpperCase() })}
                    placeholder="e.g. 27AAAAA0000A1Z5"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-mono"
                  />
                </div>
              </div>

              {/* Supplied Components Selector */}
              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <PackageCheck className="w-4 h-4 text-amber-600" />
                    Supplied Part Numbers * ({formData.supplied_components.length} assigned)
                  </label>
                  <span className="text-[11px] text-slate-500">Pick from component master</span>
                </div>

                {/* Chips of currently selected components */}
                <div className="flex flex-wrap gap-1.5 min-h-[38px] p-2 bg-white rounded-lg border border-slate-200">
                  {formData.supplied_components.length === 0 ? (
                    <span className="text-xs text-slate-400 italic">No parts added yet. Select or enter part codes below.</span>
                  ) : (
                    formData.supplied_components.map((part) => (
                      <span
                        key={part}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-900 border border-amber-200 rounded text-xs font-mono font-semibold"
                      >
                        {part}
                        <button
                          type="button"
                          onClick={() => handleRemoveComponentCode(part)}
                          className="text-amber-500 hover:text-amber-800 ml-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>

                {/* Component Search Dropdown / Picker */}
                <div className="space-y-1.5">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search component master to add..."
                      value={componentSearchTerm}
                      onChange={(e) => setComponentSearchTerm(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-md focus:ring-2 focus:ring-amber-500 bg-white"
                    />
                  </div>
                  {componentSearchTerm.trim() && (
                    <div className="max-h-32 overflow-y-auto bg-white border border-slate-200 rounded-md divide-y divide-slate-100 shadow-sm text-xs">
                      {filteredComponentOptions.length === 0 ? (
                        <div className="p-2 text-slate-400 text-center">No matching components in database</div>
                      ) : (
                        filteredComponentOptions.map((c) => (
                          <button
                            key={c.component_code}
                            type="button"
                            onClick={() => {
                              handleAddComponentCode(c.component_code);
                              setComponentSearchTerm('');
                            }}
                            className="w-full text-left px-2.5 py-1.5 hover:bg-amber-50 flex items-center justify-between"
                          >
                            <span className="font-mono font-bold text-slate-800">{c.component_code}</span>
                            <span className="text-slate-500 truncate max-w-[280px]">{c.component_description}</span>
                            <span className="text-[10px] text-amber-700 bg-amber-50 px-1 py-0.5 rounded border border-amber-200">
                              + Add
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Quick Comma-Separated Input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={rawComponentsInput}
                    onChange={(e) => setRawComponentsInput(e.target.value)}
                    placeholder="Or type comma-separated codes: 100201, 200405..."
                    className="flex-1 px-2.5 py-1 text-xs border border-slate-300 rounded-md font-mono"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleApplyRawComponents();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleApplyRawComponents}
                    className="px-3 py-1 text-xs font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-md transition-colors"
                  >
                    Add Codes
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingItem ? 'Save Changes' : 'Save Relationship'}
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
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Upload Vendor & Buyer Master CSV</h3>
                  <p className="text-xs text-slate-500">Bulk upload vendors, buyers, lead times, and supplied parts</p>
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
              {/* Notice */}
              <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 leading-relaxed">
                <div className="flex items-center gap-1.5 font-bold mb-1 text-amber-950">
                  <CheckCircle2 className="w-4 h-4 text-amber-600" />
                  Vendor & Sourcing Integration:
                </div>
                <ul className="list-disc list-inside space-y-1 text-amber-800">
                  <li><strong>Suppliers & Buyers:</strong> Updates vendor profiles, contacts, and lead times.</li>
                  <li><strong>Supplied Parts:</strong> Separate multiple component codes with semicolons (<code>;</code>) or commas (<code>,</code>).</li>
                  <li><strong>Automatic Mapping:</strong> Junction records are automatically linked to existing RM/PM components for Exploded BOM calculations.</li>
                </ul>
              </div>

              {/* Template Download Prompt */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Required: <strong>Vendor Code, Vendor Name, Buyer Name, Lead Time (Days), Supplied Components</strong></span>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="text-amber-600 hover:text-amber-800 font-semibold underline underline-offset-2 shrink-0 ml-2"
                >
                  Download Template
                </button>
              </div>

              {/* File Dropzone */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Select CSV File
                </label>
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-5 text-center hover:border-amber-500 transition-colors bg-slate-50/50">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setUploadFile(e.target.files[0]);
                        setUploadResult(null);
                      }
                    }}
                    className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100 cursor-pointer"
                  />
                  {uploadFile && (
                    <div className="mt-2 text-xs font-medium text-slate-700">
                      Selected: <span className="font-mono text-amber-600">{uploadFile.name}</span> ({(uploadFile.size / 1024).toFixed(1)} KB)
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
                  className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg shadow-sm transition-colors"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Processing Ingestion...
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-3.5 h-3.5" />
                      Upload & Ingest Vendors
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

export default VendorBuyerManager;
