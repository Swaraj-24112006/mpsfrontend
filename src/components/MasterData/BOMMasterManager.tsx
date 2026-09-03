import React, { useState } from 'react';
import {
  Layers,
  Plus,
  Search,
  Filter,
  Download,
  Upload,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet
} from 'lucide-react';
import { BOMItem } from '../../types';

interface BOMMasterManagerProps {
  boms: BOMItem[];
  onUpdateBOMs: (boms: BOMItem[]) => void;
}

export const BOMMasterManager: React.FC<BOMMasterManagerProps> = ({
  boms,
  onUpdateBOMs
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'RM' | 'PM'>('ALL');
  const [selectedFGFilter, setSelectedFGFilter] = useState<string>('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingBOM, setEditingBOM] = useState<BOMItem | null>(null);

  // Form state
  const [formData, setFormData] = useState<Partial<BOMItem>>({
    fgCode: '',
    fgDescription: '',
    componentCode: '',
    componentDescription: '',
    qty: 1.0,
    uom: 'PC',
    category: 'RM',
    line: ''
  });

  const uniqueFGs: { code: string; desc: string }[] = Array.from(
    new Map<string, { code: string; desc: string }>(
      boms.map((b) => [b.fgCode, { code: b.fgCode, desc: b.fgDescription }])
    ).values()
  );

  const filteredBOMs = boms.filter((bom) => {
    const matchesSearch =
      bom.fgCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bom.fgDescription.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bom.componentCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bom.componentDescription.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory =
      categoryFilter === 'ALL' || bom.category === categoryFilter;

    const matchesFG =
      selectedFGFilter === 'ALL' || bom.fgCode === selectedFGFilter;

    return matchesSearch && matchesCategory && matchesFG;
  });

  const handleOpenAddModal = (existing?: BOMItem) => {
    if (existing) {
      setEditingBOM(existing);
      setFormData(existing);
    } else {
      setEditingBOM(null);
      setFormData({
        fgCode: '7.',
        fgDescription: '',
        componentCode: '',
        componentDescription: '',
        qty: 1.0,
        uom: 'PC',
        category: 'RM',
        line: 'A-PMP1'
      });
    }
    setIsAddModalOpen(true);
  };

  const handleSaveBOM = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !formData.fgCode ||
      !formData.fgDescription ||
      !formData.componentCode ||
      !formData.componentDescription
    ) {
      alert('Please fill all required fields');
      return;
    }

    // SAP Convention rule check
    if (!formData.fgCode.startsWith('7')) {
      alert('Notice: In accordance with SAP rules, Finished Goods (FG) part numbers should start with "7".');
    }

    if (editingBOM) {
      const updated = boms.map((b) =>
        b.id === editingBOM.id ? ({ ...b, ...formData } as BOMItem) : b
      );
      onUpdateBOMs(updated);
    } else {
      const newItem: BOMItem = {
        id: `bom-${Date.now()}`,
        fgCode: formData.fgCode.trim(),
        fgDescription: formData.fgDescription.trim(),
        componentCode: formData.componentCode.trim(),
        componentDescription: formData.componentDescription.trim(),
        qty: Number(formData.qty) || 1,
        uom: formData.uom || 'PC',
        category: (formData.category as 'RM' | 'PM') || 'RM',
        line: formData.line || 'Line 1'
      };
      onUpdateBOMs([newItem, ...boms]);
    }
    setIsAddModalOpen(false);
  };

  const handleDeleteBOM = (id: string) => {
    if (window.confirm('Are you sure you want to remove this BOM component relationship?')) {
      onUpdateBOMs(boms.filter((b) => b.id !== id));
    }
  };

  const handleExportCSV = () => {
    const headers = [
      'FG Code',
      'FG Description',
      'Component Code',
      'Component Description',
      'Quantity Per Unit',
      'UOM',
      'Category'
    ];
    const rows = boms.map((b) => [
      `"${b.fgCode}"`,
      `"${b.fgDescription}"`,
      `"${b.componentCode}"`,
      `"${b.componentDescription}"`,
      b.qty,
      `"${b.uom}"`,
      `"${b.category}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `BOM_Master_Export_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
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
            id="export-bom-csv"
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-slate-50 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <Download className="w-4 h-4 text-slate-500" />
            Export CSV
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
          Showing <span className="text-slate-900 font-bold">{filteredBOMs.length}</span> of {boms.length} BOM relations
        </div>
      </div>

      {/* BOM Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
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
              {filteredBOMs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No BOM records matching your search or filters.
                  </td>
                </tr>
              ) : (
                filteredBOMs.map((bom) => (
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
                          onClick={() => handleOpenAddModal(bom)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Edit BOM item"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteBOM(bom.id)}
                          className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
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
      </div>

      {/* Add / Edit Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-600" />
              {editingBOM ? 'Edit BOM Item' : 'Add New BOM Item'}
            </h2>

            <form onSubmit={handleSaveBOM} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    FG Part Number * (Starts with 7)
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.fgCode || ''}
                    onChange={(e) => setFormData({ ...formData, fgCode: e.target.value })}
                    placeholder="e.g. 7.06496.03.0"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    FG Description *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.fgDescription || ''}
                    onChange={(e) => setFormData({ ...formData, fgDescription: e.target.value })}
                    placeholder="e.g. Vacuum Pump Panther 2.0L"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Component Code * (RM / PM)
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.componentCode || ''}
                    onChange={(e) => setFormData({ ...formData, componentCode: e.target.value })}
                    placeholder="e.g. 100201 or RM-CAST-01"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Component Description *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.componentDescription || ''}
                    onChange={(e) => setFormData({ ...formData, componentDescription: e.target.value })}
                    placeholder="e.g. Die-Cast Aluminum Housing"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Quantity per FG *
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    required
                    value={formData.qty ?? 1}
                    onChange={(e) => setFormData({ ...formData, qty: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    UOM *
                  </label>
                  <select
                    value={formData.uom || 'PC'}
                    onChange={(e) => setFormData({ ...formData, uom: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
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
                    Category *
                  </label>
                  <select
                    value={formData.category || 'RM'}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as 'RM' | 'PM' })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="RM">Raw Material (RM)</option>
                    <option value="PM">Packaging Material (PM)</option>
                  </select>
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
                  className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
                >
                  {editingBOM ? 'Save Changes' : 'Create BOM Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
