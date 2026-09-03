import React, { useState } from 'react';
import {
  Users,
  Building2,
  Plus,
  Search,
  Filter,
  Download,
  Edit2,
  Trash2,
  UserCheck,
  Clock,
  PackageCheck,
  Mail,
  Phone
} from 'lucide-react';
import { VendorBuyerItem } from '../../types';

interface VendorBuyerManagerProps {
  vendorBuyers: VendorBuyerItem[];
  onUpdateVendorBuyers: (items: VendorBuyerItem[]) => void;
}

export const VendorBuyerManager: React.FC<VendorBuyerManagerProps> = ({
  vendorBuyers,
  onUpdateVendorBuyers
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [buyerFilter, setBuyerFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'RM' | 'PM'>('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VendorBuyerItem | null>(null);

  const [formData, setFormData] = useState<Partial<VendorBuyerItem>>({
    vendorCode: '',
    vendorName: '',
    buyerName: '',
    buyerEmail: '',
    buyerPhone: '',
    category: 'RM',
    suppliedComponents: [],
    leadTimeDays: 7,
    city: '',
    gstNo: ''
  });

  const [componentsInput, setComponentsInput] = useState('');

  const uniqueBuyers = Array.from(new Set(vendorBuyers.map((v) => v.buyerName))).filter(Boolean);

  const filteredItems = vendorBuyers.filter((item) => {
    const matchesSearch =
      item.vendorCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.vendorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.buyerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.suppliedComponents.some((c) => c.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesBuyer = buyerFilter === 'ALL' || item.buyerName === buyerFilter;
    const matchesCategory = categoryFilter === 'ALL' || item.category === categoryFilter;

    return matchesSearch && matchesBuyer && matchesCategory;
  });

  const handleOpenModal = (item?: VendorBuyerItem) => {
    if (item) {
      setEditingItem(item);
      setFormData(item);
      setComponentsInput(item.suppliedComponents.join(', '));
    } else {
      setEditingItem(null);
      setFormData({
        vendorCode: 'V-',
        vendorName: '',
        buyerName: 'Rajesh Kumar (Buyer - Castings)',
        buyerEmail: '',
        buyerPhone: '',
        category: 'RM',
        leadTimeDays: 7,
        city: '',
        gstNo: ''
      });
      setComponentsInput('');
    }
    setIsAddModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.vendorCode || !formData.vendorName || !formData.buyerName) {
      alert('Please fill vendor code, vendor name, and buyer name.');
      return;
    }

    const parts = componentsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (editingItem) {
      const updated = vendorBuyers.map((v) =>
        v.id === editingItem.id
          ? ({
              ...v,
              ...formData,
              suppliedComponents: parts
            } as VendorBuyerItem)
          : v
      );
      onUpdateVendorBuyers(updated);
    } else {
      const newItem: VendorBuyerItem = {
        id: `vb-${Date.now()}`,
        vendorCode: formData.vendorCode.trim(),
        vendorName: formData.vendorName.trim(),
        buyerName: formData.buyerName.trim(),
        buyerEmail: formData.buyerEmail?.trim() || '',
        buyerPhone: formData.buyerPhone?.trim() || '',
        category: (formData.category as 'RM' | 'PM') || 'RM',
        suppliedComponents: parts,
        leadTimeDays: Number(formData.leadTimeDays) || 7,
        city: formData.city?.trim() || '',
        gstNo: formData.gstNo?.trim() || ''
      };
      onUpdateVendorBuyers([newItem, ...vendorBuyers]);
    }
    setIsAddModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this Vendor & Buyer relationship?')) {
      onUpdateVendorBuyers(vendorBuyers.filter((v) => v.id !== id));
    }
  };

  const handleExportCSV = () => {
    const headers = [
      'Vendor Code',
      'Vendor Name',
      'Buyer Name',
      'Buyer Email',
      'Category',
      'Supplied Component Codes',
      'Lead Time (Days)',
      'City'
    ];
    const rows = vendorBuyers.map((v) => [
      `"${v.vendorCode}"`,
      `"${v.vendorName}"`,
      `"${v.buyerName}"`,
      `"${v.buyerEmail || ''}"`,
      `"${v.category}"`,
      `"${v.suppliedComponents.join('; ')}"`,
      v.leadTimeDays,
      `"${v.city || ''}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Vendor_Buyer_Master_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Vendor and Buyer Relationship Master</h1>
            <p className="text-sm text-slate-500">
              Maps vendors, assigned supply buyer planners, lead times, and supplied component codes
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-slate-50 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <Download className="w-4 h-4 text-slate-500" />
            Export CSV
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
              placeholder="Search vendor code, name, buyer, part code..."
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
        </div>

        <div className="text-xs font-medium text-slate-500">
          Showing <span className="text-slate-900 font-bold">{filteredItems.length}</span> of {vendorBuyers.length} vendor mappings
        </div>
      </div>

      {/* Grid of Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredItems.map((item) => (
          <div
            key={item.id}
            className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:border-amber-300 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-700 font-mono font-bold flex items-center justify-center text-xs border border-amber-200">
                    {item.vendorCode}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{item.vendorName}</h3>
                    <div className="text-xs text-slate-500">{item.city || 'Domestic Supplier'}</div>
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
                <div className="text-sm font-bold text-slate-900">{item.buyerName}</div>
                {item.buyerEmail && (
                  <div className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                    <Mail className="w-3 h-3 text-slate-400" />
                    {item.buyerEmail}
                  </div>
                )}
              </div>

              {/* Supplied Components */}
              <div className="mb-3">
                <div className="text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1">
                  <PackageCheck className="w-3.5 h-3.5 text-slate-400" />
                  Supplied Part Numbers ({item.suppliedComponents.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {item.suppliedComponents.map((part) => (
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
                Lead Time: <span className="font-bold text-slate-900">{item.leadTimeDays} Days</span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleOpenModal(item)}
                  className="p-1 text-slate-500 hover:text-amber-600 rounded transition-colors"
                  title="Edit Vendor & Buyer"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="p-1 text-slate-500 hover:text-red-600 rounded transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add / Edit Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-600" />
              {editingItem ? 'Edit Vendor & Buyer Mapping' : 'Add Vendor & Buyer Relationship'}
            </h2>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Vendor Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.vendorCode || ''}
                    onChange={(e) => setFormData({ ...formData, vendorCode: e.target.value })}
                    placeholder="e.g. V-1001"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Vendor Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.vendorName || ''}
                    onChange={(e) => setFormData({ ...formData, vendorName: e.target.value })}
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
                  value={formData.buyerName || ''}
                  onChange={(e) => setFormData({ ...formData, buyerName: e.target.value })}
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
                    value={formData.buyerEmail || ''}
                    onChange={(e) => setFormData({ ...formData, buyerEmail: e.target.value })}
                    placeholder="e.g. buyer@autoparts.com"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Lead Time (Days) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.leadTimeDays ?? 7}
                    onChange={(e) => setFormData({ ...formData, leadTimeDays: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Supplied Component Codes (Comma separated) *
                </label>
                <textarea
                  rows={3}
                  value={componentsInput}
                  onChange={(e) => setComponentsInput(e.target.value)}
                  placeholder="e.g. 100201, 100301, 100401"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-mono"
                />
                <div className="text-[11px] text-slate-500 mt-1">
                  Enter component codes without 7 (e.g. 100201, 200405, 800101).
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Category *
                  </label>
                  <select
                    value={formData.category || 'RM'}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as 'RM' | 'PM' })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white"
                  >
                    <option value="RM">Raw Material (RM)</option>
                    <option value="PM">Packaging Material (PM)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Location / City
                  </label>
                  <input
                    type="text"
                    value={formData.city || ''}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="e.g. Pune, Maharashtra"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm transition-colors"
                >
                  {editingItem ? 'Save Changes' : 'Save Relationship'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
