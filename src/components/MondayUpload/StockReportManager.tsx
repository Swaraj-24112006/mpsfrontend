import React, { useState } from 'react';
import {
  Package,
  Upload,
  Plus,
  Download,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Boxes,
  ShieldCheck,
  Edit2,
  Trash2,
  Layers
} from 'lucide-react';
import { StockReportItem } from '../../types';

interface StockReportManagerProps {
  stockList: StockReportItem[];
  onUpdateStock: (items: StockReportItem[]) => void;
}

export const StockReportManager: React.FC<StockReportManagerProps> = ({
  stockList,
  onUpdateStock
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'FG' | 'RM' | 'PM'>('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StockReportItem | null>(null);

  const [formData, setFormData] = useState<Partial<StockReportItem>>({
    partNumber: '',
    materialDescription: '',
    materialType: 'RM',
    unrestrictedStock: 1000,
    inQualityInsp: 0,
    blocked: 0,
    storageLocation: 'SL01',
    uom: 'PC',
    safetyStock: 500,
    plant: '1001'
  });

  const [csvInput, setCsvInput] = useState('');

  // Auto derive material type based on user requirement: startsWith('7') -> FG, else RM/PM
  const deriveMaterialType = (part: string, category?: string): 'FG' | 'RM' | 'PM' => {
    if (part.startsWith('7')) return 'FG';
    if (category === 'PM' || part.startsWith('8')) return 'PM';
    return 'RM';
  };

  const filteredStocks = stockList.filter((item) => {
    const matchesSearch =
      item.partNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.materialDescription.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.storageLocation.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = typeFilter === 'ALL' || item.materialType === typeFilter;

    return matchesSearch && matchesType;
  });

  // KPI calculations
  const totalFGStock = stockList
    .filter((s) => s.materialType === 'FG')
    .reduce((sum, s) => sum + s.unrestrictedStock, 0);

  const totalRMStock = stockList
    .filter((s) => s.materialType === 'RM')
    .reduce((sum, s) => sum + s.unrestrictedStock, 0);

  const totalPMStock = stockList
    .filter((s) => s.materialType === 'PM')
    .reduce((sum, s) => sum + s.unrestrictedStock, 0);

  const lowStockCount = stockList.filter(
    (s) => s.unrestrictedStock < s.safetyStock
  ).length;

  const handleOpenAddModal = (existing?: StockReportItem) => {
    if (existing) {
      setEditingItem(existing);
      setFormData(existing);
    } else {
      setEditingItem(null);
      setFormData({
        partNumber: '',
        materialDescription: '',
        materialType: 'RM',
        unrestrictedStock: 1000,
        inQualityInsp: 0,
        blocked: 0,
        storageLocation: 'SL01-Raw Materials',
        uom: 'PC',
        safetyStock: 500,
        plant: '1001'
      });
    }
    setIsAddModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.partNumber || formData.unrestrictedStock === undefined) {
      alert('Please fill part number and unrestricted stock quantity.');
      return;
    }

    const type = deriveMaterialType(
      formData.partNumber,
      formData.materialType
    );

    if (editingItem) {
      const updated = stockList.map((s) =>
        s.id === editingItem.id
          ? ({
              ...s,
              ...formData,
              materialType: type,
              lastUpdated: new Date().toISOString().slice(0, 10)
            } as StockReportItem)
          : s
      );
      onUpdateStock(updated);
    } else {
      const newItem: StockReportItem = {
        id: `stk-${Date.now()}`,
        partNumber: formData.partNumber.trim(),
        materialDescription: formData.materialDescription?.trim() || 'Material',
        materialType: type,
        unrestrictedStock: Number(formData.unrestrictedStock) || 0,
        inQualityInsp: Number(formData.inQualityInsp) || 0,
        blocked: Number(formData.blocked) || 0,
        storageLocation: formData.storageLocation || 'SL01',
        uom: formData.uom || 'PC',
        safetyStock: Number(formData.safetyStock) || 500,
        plant: formData.plant || '1001',
        lastUpdated: new Date().toISOString().slice(0, 10)
      };
      onUpdateStock([newItem, ...stockList]);
    }
    setIsAddModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this stock record?')) {
      onUpdateStock(stockList.filter((s) => s.id !== id));
    }
  };

  const handleCSVUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvInput.trim()) {
      alert('Please paste CSV or tab-separated stock data.');
      return;
    }

    const lines = csvInput.trim().split('\n');
    const parsed: StockReportItem[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (
        i === 0 &&
        (line.toLowerCase().includes('part') ||
          line.toLowerCase().includes('stock') ||
          line.toLowerCase().includes('material'))
      ) {
        continue;
      }

      const delimiter = line.includes('\t') ? '\t' : ',';
      const parts = line.split(delimiter).map((s) => s.replace(/^"|"$/g, '').trim());

      // Format: Part Number, Description, Unrestricted Stock, In Quality, Blocked, Safety Stock, UOM, SLOC
      if (parts.length >= 2) {
        const partNo = parts[0];
        const desc = parts.length >= 3 ? parts[1] : `Material ${partNo}`;
        const stockStr = parts.length >= 3 ? parts[2] : parts[1];
        const stock = parseFloat(stockStr.replace(/,/g, '')) || 0;
        const safetyStr = parts.length >= 6 ? parts[5] : '500';
        const safety = parseFloat(safetyStr.replace(/,/g, '')) || 500;
        const uom = parts.length >= 7 ? parts[6] : 'PC';
        const sloc = parts.length >= 8 ? parts[7] : 'SL01';

        if (partNo) {
          const type = deriveMaterialType(partNo);
          parsed.push({
            id: `stk-${Date.now()}-${i}`,
            partNumber: partNo,
            materialDescription: desc,
            materialType: type,
            unrestrictedStock: stock,
            inQualityInsp: 0,
            blocked: 0,
            safetyStock: safety,
            storageLocation: sloc,
            uom,
            plant: '1001',
            lastUpdated: new Date().toISOString().slice(0, 10)
          });
        }
      }
    }

    if (parsed.length === 0) {
      alert('No valid stock records found.');
      return;
    }

    // Merge or replace
    onUpdateStock([...parsed, ...stockList]);
    setIsUploadModalOpen(false);
    setCsvInput('');
  };

  const handleExportCSV = () => {
    const headers = [
      'Part Number',
      'Material Description',
      'Type',
      'Unrestricted Stock',
      'In Quality Insp',
      'Blocked Stock',
      'Safety Stock',
      'UOM',
      'Storage Location',
      'Plant'
    ];

    const rows = filteredStocks.map((s) => [
      `"${s.partNumber}"`,
      `"${s.materialDescription}"`,
      `"${s.materialType}"`,
      s.unrestrictedStock,
      s.inQualityInsp,
      s.blocked,
      s.safetyStock,
      `"${s.uom}"`,
      `"${s.storageLocation}"`,
      `"${s.plant}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Stock_Report_MB52_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-600">
            <Boxes className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Monday Upload: Stock Report (SAP MB52)</h1>
            <p className="text-sm text-slate-500">
              Current on-hand unrestricted inventory balances for Finished Goods (prefix 7) and RM/PM materials
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-teal-800 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors"
          >
            <Upload className="w-4 h-4 text-teal-600" />
            Upload Stock CSV / Excel
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-slate-50 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <Download className="w-4 h-4 text-slate-500" />
            Export CSV
          </button>
          <button
            onClick={() => handleOpenAddModal()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Stock Item
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Finished Goods (FG) Stock</div>
          <div className="text-2xl font-bold text-slate-900 mt-1 font-mono">
            {totalFGStock.toLocaleString()} <span className="text-xs text-slate-500 font-normal">Units</span>
          </div>
          <div className="text-xs text-blue-600 font-semibold mt-1">Part prefix starting with '7'</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Raw Materials (RM) Stock</div>
          <div className="text-2xl font-bold text-slate-900 mt-1 font-mono">
            {totalRMStock.toLocaleString()} <span className="text-xs text-slate-500 font-normal">Units</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">On-hand usable stock</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Packaging Materials (PM)</div>
          <div className="text-2xl font-bold text-slate-900 mt-1 font-mono">
            {totalPMStock.toLocaleString()} <span className="text-xs text-slate-500 font-normal">Units</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">Liner bags, cartons & boxes</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Below Safety Stock</div>
          <div className="text-2xl font-bold text-amber-600 mt-1 font-mono">
            {lowStockCount} Materials
          </div>
          <div className="text-xs text-slate-500 mt-1">Requires buyer replenishment</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setTypeFilter('ALL')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              typeFilter === 'ALL'
                ? 'bg-white text-teal-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Inventory ({stockList.length})
          </button>
          <button
            onClick={() => setTypeFilter('FG')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              typeFilter === 'FG'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Finished Goods (FG)
          </button>
          <button
            onClick={() => setTypeFilter('RM')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              typeFilter === 'RM'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Raw Materials (RM)
          </button>
          <button
            onClick={() => setTypeFilter('PM')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              typeFilter === 'PM'
                ? 'bg-white text-purple-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Packaging (PM)
          </button>
        </div>

        <div className="relative min-w-[260px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search part number, description, SLOC..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      </div>

      {/* Stock Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider font-semibold">
                <th className="py-3.5 px-4">Part Number</th>
                <th className="py-3.5 px-4">Material Description</th>
                <th className="py-3.5 px-4 text-center">Type</th>
                <th className="py-3.5 px-4 text-right">Unrestricted Stock</th>
                <th className="py-3.5 px-4 text-right">In Quality</th>
                <th className="py-3.5 px-4 text-right">Safety Stock</th>
                <th className="py-3.5 px-4 text-center">UOM</th>
                <th className="py-3.5 px-4">Storage Location</th>
                <th className="py-3.5 px-4 text-center">Stock Health</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredStocks.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400">
                    No stock records match your search or filter.
                  </td>
                </tr>
              ) : (
                filteredStocks.map((stock) => {
                  const isLow = stock.unrestrictedStock < stock.safetyStock;

                  return (
                    <tr key={stock.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 text-xs">
                        <span
                          className={`px-1.5 py-0.5 rounded border ${
                            stock.materialType === 'FG'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-slate-50 text-slate-800 border-slate-200'
                          }`}
                        >
                          {stock.partNumber}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-800 font-medium text-xs">
                        {stock.materialDescription}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            stock.materialType === 'FG'
                              ? 'bg-blue-100 text-blue-800'
                              : stock.materialType === 'PM'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {stock.materialType}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {stock.unrestrictedStock.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-500 text-xs">
                        {stock.inQualityInsp.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600 text-xs">
                        {stock.safetyStock.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-center text-xs font-medium text-slate-500">
                        {stock.uom}
                      </td>
                      <td className="py-3 px-4 text-xs font-mono text-slate-600">
                        {stock.storageLocation}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {isLow ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-xs font-semibold border border-amber-200">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            Low Stock
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-xs font-semibold border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Adequate
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenAddModal(stock)}
                            className="p-1.5 text-slate-400 hover:text-teal-600 rounded transition-colors"
                            title="Edit Stock"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(stock.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
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
              <Boxes className="w-5 h-5 text-teal-600" />
              {editingItem ? 'Edit Stock Balance' : 'Add On-Hand Stock Record'}
            </h2>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Part Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.partNumber || ''}
                    onChange={(e) => setFormData({ ...formData, partNumber: e.target.value })}
                    placeholder="e.g. 7.06496.03.0 or 100201"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 font-mono"
                  />
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Prefix '7' = FG, other = RM/PM
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Material Description *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.materialDescription || ''}
                    onChange={(e) => setFormData({ ...formData, materialDescription: e.target.value })}
                    placeholder="e.g. Vacuum Pump Panther 2.0L"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Unrestricted Stock *
                  </label>
                  <input
                    type="number"
                    required
                    value={formData.unrestrictedStock ?? 1000}
                    onChange={(e) =>
                      setFormData({ ...formData, unrestrictedStock: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    In Quality Insp
                  </label>
                  <input
                    type="number"
                    value={formData.inQualityInsp ?? 0}
                    onChange={(e) =>
                      setFormData({ ...formData, inQualityInsp: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Safety Stock
                  </label>
                  <input
                    type="number"
                    value={formData.safetyStock ?? 500}
                    onChange={(e) =>
                      setFormData({ ...formData, safetyStock: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Storage Location (SLOC)
                  </label>
                  <input
                    type="text"
                    value={formData.storageLocation || 'SL01'}
                    onChange={(e) => setFormData({ ...formData, storageLocation: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    UOM
                  </label>
                  <input
                    type="text"
                    value={formData.uom || 'PC'}
                    onChange={(e) => setFormData({ ...formData, uom: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500"
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
                  className="px-5 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm transition-colors"
                >
                  Save Stock Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload CSV Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-xl w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <h2 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
              <Upload className="w-5 h-5 text-teal-600" />
              Upload Stock Report (SAP MB52)
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Paste your SAP inventory export below. Columns: Part Number, Description, Unrestricted Stock, Safety Stock, UOM, SLOC.
            </p>

            <form onSubmit={handleCSVUpload} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Stock Data (CSV / TSV)
                </label>
                <textarea
                  rows={8}
                  required
                  value={csvInput}
                  onChange={(e) => setCsvInput(e.target.value)}
                  placeholder={`PartNumber,Description,UnrestrictedStock,SafetyStock,UOM,SLOC\n7.06496.03.0,Vacuum Pump Panther 2.0L,1200,500,PC,FG01\n100201,Die-Cast Aluminum Housing,2200,1000,PC,SL01\n100202,Precision Rotor Assembly,3100,1500,PC,SL01`}
                  className="w-full p-3 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm transition-colors"
                >
                  Import Stock Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
