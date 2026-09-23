import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import {
  FileSpreadsheet,
  Upload,
  Download,
  Calendar,
  Layers,
  Edit3,
  Trash2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Plus,
  Search,
  Filter,
  Truck,
  Building2,
  Users,
  Share2,
  Zap,
  Clock,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  FileCheck,
  HelpCircle,
  X,
  History,
  Flame
} from 'lucide-react';
import {
  BOMItem,
  VendorBuyerItem,
  WeekDefinition,
  MonthlyPlanItem,
  MB51TransactionItem,
  StockReportItem,
  VendorDeliverySchedule,
  VendorDeliveryScheduleChangeLog,
  DeliveryCommitmentStatus,
  UserRole,
  USER_ROLES
} from '../../types';
import { isDateInWeek } from '../../utils/weeklyMrpEngine';
import { HistoryDrawer, HistoryDrawerFilter } from './HistoryDrawer';
import { SupplyRiskHeatmap } from './SupplyRiskHeatmap';

interface VendorScheduleManagerProps {
  monthlyPlans: MonthlyPlanItem[];
  weeks: WeekDefinition[];
  boms: BOMItem[];
  vendorBuyers: VendorBuyerItem[];
  mb51List: MB51TransactionItem[];
  stockList: StockReportItem[];
  vendorDeliverySchedules: VendorDeliverySchedule[];
  onUpdateVendorDeliverySchedules: (schedules: VendorDeliverySchedule[]) => void;
  deliveryScheduleChangeLogs: VendorDeliveryScheduleChangeLog[];
  onUpdateDeliveryScheduleChangeLogs: (logs: VendorDeliveryScheduleChangeLog[]) => void;
  selectedMonth: string;
  onSelectMonth: (month: string) => void;
  currentRole: UserRole;
  onSelectRole: (role: UserRole) => void;
}

interface ConsolidatedComponentRow {
  componentCode: string;
  componentDescription: string;
  category: 'RM' | 'PM';
  uom: string;
  isCommonPart: boolean;
  usedInFGs: { fgCode: string; fgDescription: string; usagePerFG: number }[];
  sharedInFGsCount: number;
  buyerName: string;
  vendorName: string;
  vendorCode: string;
  leadTimeDays: number;
  totalPhysicalStock: number;
  reservedStock: number;
  availableStock: number;
  
  // Weekly Breakdown
  weeklyGrossReq: Record<string, number>; // weekId -> gross requirement
  weeklyInwardDeliveries: Record<string, number>; // weekId -> promised inward deliveries
  weeklySchedules: Record<string, VendorDeliverySchedule[]>; // weekId -> list of schedules
  
  // For Selected Scope
  selectedScopeGrossReq: number;
  selectedScopeInward: number;
  selectedScopeBalance: number; // availableStock + selectedScopeInward - selectedScopeGrossReq
  selectedScopeDeficit: number;
  hasShortage: boolean;
  activeSchedulesForScope: VendorDeliverySchedule[];
  
  // Full Month Aggregations
  monthTotalGrossReq: number;
  monthTotalInward: number;
  monthEndingBalance: number;
}

interface ParsedScheduleRow {
  rowIndex: number;
  poNumber: string;
  componentCode: string;
  componentDescription: string;
  vendorCode: string;
  vendorName: string;
  buyerName: string;
  expectedDeliveryDate: string;
  weekNo?: number;
  weekId?: string;
  promisedQty: number;
  deliveryStatus: DeliveryCommitmentStatus;
  carrierOrTracking: string;
  notes: string;
  isValid: boolean;
  validationStatus: 'VALID' | 'WARNING' | 'ERROR';
  validationMessage: string;
}

export const VendorScheduleManager: React.FC<VendorScheduleManagerProps> = ({
  monthlyPlans,
  weeks,
  boms,
  vendorBuyers,
  mb51List,
  stockList,
  vendorDeliverySchedules,
  onUpdateVendorDeliverySchedules,
  deliveryScheduleChangeLogs,
  onUpdateDeliveryScheduleChangeLogs,
  selectedMonth,
  onSelectMonth,
  currentRole,
  onSelectRole
}) => {
  // Navigation & View Mode
  const [activeTab, setActiveTab] = useState<'supply_risk_heatmap' | 'consolidated_matrix' | 'schedules_list'>('consolidated_matrix');
  const [scopeMode, setScopeMode] = useState<'WEEK' | 'MONTH'>('WEEK');
  
  // Active Weeks for Selected Month
  const monthWeeks = useMemo(() => {
    return weeks
      .filter((w) => w.month === selectedMonth)
      .sort((a, b) => a.weekNo - b.weekNo);
  }, [weeks, selectedMonth]);

  const [selectedWeekId, setSelectedWeekId] = useState<string>(() => {
    return monthWeeks[0]?.id || '';
  });

  // Keep selectedWeekId valid when month changes
  React.useEffect(() => {
    if (monthWeeks.length > 0) {
      const exists = monthWeeks.some((w) => w.id === selectedWeekId);
      if (!exists) {
        setSelectedWeekId(monthWeeks[0].id);
      }
    }
  }, [monthWeeks, selectedWeekId]);

  const activeWeek = monthWeeks.find((w) => w.id === selectedWeekId) || monthWeeks[0];

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBuyer, setSelectedBuyer] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | 'RM' | 'PM'>('ALL');
  const [criticalityFilter, setCriticalityFilter] = useState<'ALL' | 'SHORTAGES_ONLY' | 'COMMON_ONLY' | 'SCHEDULED_ONLY'>('ALL');

  // Modals State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isSingleScheduleModalOpen, setIsSingleScheduleModalOpen] = useState(false);
  const [isCommonPartsModalOpen, setIsCommonPartsModalOpen] = useState(false);
  const [selectedCommonComp, setSelectedCommonComp] = useState<ConsolidatedComponentRow | null>(null);

  // Single Schedule Form State
  const [singleScheduleForm, setSingleScheduleForm] = useState<{
    id?: string;
    poNumber: string;
    componentCode: string;
    componentDescription: string;
    vendorCode: string;
    vendorName: string;
    buyerName: string;
    expectedDeliveryDate: string;
    weekId: string;
    promisedQty: number;
    carrierOrTracking: string;
    deliveryStatus: DeliveryCommitmentStatus;
    notes: string;
    reasonForChange: string;
  }>({
    poNumber: '',
    componentCode: '',
    componentDescription: '',
    vendorCode: '',
    vendorName: '',
    buyerName: '',
    expectedDeliveryDate: '',
    weekId: '',
    promisedQty: 1000,
    carrierOrTracking: 'Direct Express Truck',
    deliveryStatus: 'CONFIRMED_ON_TRACK',
    notes: '',
    reasonForChange: ''
  });

  // Upload Excel / CSV State
  const [uploadScope, setUploadScope] = useState<'SELECTED_WEEK' | 'FULL_MONTH'>('SELECTED_WEEK');
  const [importMode, setImportMode] = useState<'APPEND' | 'OVERWRITE'>('APPEND');
  const [parsedRows, setParsedRows] = useState<ParsedScheduleRow[]>([]);
  const [pastedText, setPastedText] = useState('');
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadPlannerName, setUploadPlannerName] = useState(() => {
    return currentRole === 'supply_planner'
      ? 'Rajesh Kumar (Supply Planner / Buyer)'
      : 'Supply Operations Lead';
  });

  // Success / Notice Banner
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const showNotification = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 5000);
  };

  // History Drawer State
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [historyDrawerFilter, setHistoryDrawerFilter] = useState<HistoryDrawerFilter | null>(null);

  const handleOpenHistoryDrawer = (filter?: HistoryDrawerFilter) => {
    setHistoryDrawerFilter(filter || null);
    setIsHistoryDrawerOpen(true);
  };

  // Distinct Buyer list
  const buyerOptions = useMemo(() => {
    const buyers = new Set<string>();
    vendorBuyers.forEach((vb) => {
      if (vb.buyerName) buyers.add(vb.buyerName);
    });
    return Array.from(buyers).sort();
  }, [vendorBuyers]);

  // ==========================================================================
  // COMPUTE CONSOLIDATED RM / PM REQUIREMENTS & COMMON ITEMS MATRIX
  // ==========================================================================
  const consolidatedRows: ConsolidatedComponentRow[] = useMemo(() => {
    const monthPlans = monthlyPlans.filter((p) => p.month === selectedMonth);

    // 1. Map all components from BOM Master
    const compMap = new Map<
      string,
      {
        componentCode: string;
        componentDescription: string;
        category: 'RM' | 'PM';
        uom: string;
        usedInFGs: { fgCode: string; fgDescription: string; usagePerFG: number }[];
      }
    >();

    boms.forEach((bom) => {
      const existing = compMap.get(bom.componentCode);
      if (existing) {
        if (!existing.usedInFGs.some((f) => f.fgCode === bom.fgCode)) {
          existing.usedInFGs.push({
            fgCode: bom.fgCode,
            fgDescription: bom.fgDescription,
            usagePerFG: bom.qty
          });
        }
      } else {
        compMap.set(bom.componentCode, {
          componentCode: bom.componentCode,
          componentDescription: bom.componentDescription,
          category: bom.category || (bom.componentCode.startsWith('8') ? 'PM' : 'RM'),
          uom: bom.uom,
          usedInFGs: [
            {
              fgCode: bom.fgCode,
              fgDescription: bom.fgDescription,
              usagePerFG: bom.qty
            }
          ]
        });
      }
    });

    const rows: ConsolidatedComponentRow[] = [];

    compMap.forEach((comp) => {
      // Vendor Buyer Info
      const vbMapping = vendorBuyers.find((vb) => vb.suppliedComponents.includes(comp.componentCode));
      const buyerName = vbMapping ? vbMapping.buyerName : 'Unassigned Buyer';
      const vendorName = vbMapping ? vbMapping.vendorName : 'Direct Vendor';
      const vendorCode = vbMapping ? vbMapping.vendorCode : 'V-NONE';
      const leadTimeDays = vbMapping ? vbMapping.leadTimeDays : 7;

      // Stock Info (MB52 Unrestricted)
      const stockItem = stockList.find((s) => s.partNumber === comp.componentCode);
      const totalPhysicalStock = stockItem ? stockItem.unrestrictedStock : 0;
      
      // Calculate reserved stock by frozen plans in the current review week
      const isCommon = comp.usedInFGs.length > 1;
      const reservedStock = isCommon ? Math.round(totalPhysicalStock * 0.15) : 0;
      const availableStock = Math.max(0, totalPhysicalStock - reservedStock);

      // Weekly Gross Requirements and Inward Deliveries
      const weeklyGrossReq: Record<string, number> = {};
      const weeklyInwardDeliveries: Record<string, number> = {};
      const weeklySchedules: Record<string, VendorDeliverySchedule[]> = {};

      let monthTotalGrossReq = 0;
      let monthTotalInward = 0;

      monthWeeks.forEach((week) => {
        // Calculate Gross Req across all FG plans in this month for this week
        let grossReq = 0;
        comp.usedInFGs.forEach((fgUsage) => {
          const fgPlan = monthPlans.find((p) => p.fgCode === fgUsage.fgCode);
          if (fgPlan) {
            const fgWeekQty = fgPlan.weeklyBreakdown[week.id] || 0;
            grossReq += fgWeekQty * fgUsage.usagePerFG;
          }
        });
        grossReq = Math.round(grossReq);
        weeklyGrossReq[week.id] = grossReq;
        monthTotalGrossReq += grossReq;

        // Filter active vendor delivery schedules for this week
        const schedulesForWeek = vendorDeliverySchedules.filter((s) => {
          if (s.componentCode !== comp.componentCode) return false;
          if (s.deliveryStatus === 'CANCELLED') return false;
          if (s.weekId === week.id) return true;
          return isDateInWeek(s.expectedDeliveryDate, week);
        });

        weeklySchedules[week.id] = schedulesForWeek;
        const totalInwardForWeek = schedulesForWeek.reduce((sum, s) => sum + (s.promisedQty || 0), 0);
        weeklyInwardDeliveries[week.id] = totalInwardForWeek;
        monthTotalInward += totalInwardForWeek;
      });

      // Compute Selected Scope Metrics
      let selectedScopeGrossReq = 0;
      let selectedScopeInward = 0;
      let activeSchedulesForScope: VendorDeliverySchedule[] = [];

      if (scopeMode === 'WEEK' && activeWeek) {
        selectedScopeGrossReq = weeklyGrossReq[activeWeek.id] || 0;
        selectedScopeInward = weeklyInwardDeliveries[activeWeek.id] || 0;
        activeSchedulesForScope = weeklySchedules[activeWeek.id] || [];
      } else {
        selectedScopeGrossReq = monthTotalGrossReq;
        selectedScopeInward = monthTotalInward;
        activeSchedulesForScope = vendorDeliverySchedules.filter(
          (s) => s.componentCode === comp.componentCode && s.deliveryStatus !== 'CANCELLED'
        );
      }

      const selectedScopeBalance = availableStock + selectedScopeInward - selectedScopeGrossReq;
      const selectedScopeDeficit = selectedScopeBalance < 0 ? Math.abs(selectedScopeBalance) : 0;
      const hasShortage = selectedScopeBalance < 0;

      const monthEndingBalance = availableStock + monthTotalInward - monthTotalGrossReq;

      rows.push({
        componentCode: comp.componentCode,
        componentDescription: comp.componentDescription,
        category: comp.category,
        uom: comp.uom,
        isCommonPart: isCommon,
        usedInFGs: comp.usedInFGs,
        sharedInFGsCount: comp.usedInFGs.length,
        buyerName,
        vendorName,
        vendorCode,
        leadTimeDays,
        totalPhysicalStock,
        reservedStock,
        availableStock,
        weeklyGrossReq,
        weeklyInwardDeliveries,
        weeklySchedules,
        selectedScopeGrossReq,
        selectedScopeInward,
        selectedScopeBalance,
        selectedScopeDeficit,
        hasShortage,
        activeSchedulesForScope,
        monthTotalGrossReq,
        monthTotalInward,
        monthEndingBalance
      });
    });

    // Sort: Shortages first, then common items, then alphabetical
    return rows.sort((a, b) => {
      if (a.hasShortage && !b.hasShortage) return -1;
      if (!a.hasShortage && b.hasShortage) return 1;
      if (a.isCommonPart && !b.isCommonPart) return -1;
      if (!a.isCommonPart && b.isCommonPart) return 1;
      return a.componentCode.localeCompare(b.componentCode);
    });
  }, [monthlyPlans, boms, vendorBuyers, stockList, vendorDeliverySchedules, selectedMonth, monthWeeks, scopeMode, activeWeek]);

  // Filtered Consolidated Rows
  const filteredRows = useMemo(() => {
    return consolidatedRows.filter((r) => {
      if (selectedBuyer !== 'ALL' && r.buyerName !== selectedBuyer) return false;
      if (selectedCategory !== 'ALL' && r.category !== selectedCategory) return false;
      if (criticalityFilter === 'SHORTAGES_ONLY' && !r.hasShortage) return false;
      if (criticalityFilter === 'COMMON_ONLY' && !r.isCommonPart) return false;
      if (criticalityFilter === 'SCHEDULED_ONLY' && r.selectedScopeInward <= 0) return false;

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchCode = r.componentCode.toLowerCase().includes(term);
        const matchDesc = r.componentDescription.toLowerCase().includes(term);
        const matchVendor = r.vendorName.toLowerCase().includes(term);
        const matchBuyer = r.buyerName.toLowerCase().includes(term);
        const matchFGs = r.usedInFGs.some(
          (fg) => fg.fgCode.toLowerCase().includes(term) || fg.fgDescription.toLowerCase().includes(term)
        );
        return matchCode || matchDesc || matchVendor || matchBuyer || matchFGs;
      }
      return true;
    });
  }, [consolidatedRows, selectedBuyer, selectedCategory, criticalityFilter, searchTerm]);

  // Summary Metrics
  const summaryMetrics = useMemo(() => {
    const totalComponents = consolidatedRows.length;
    const commonPartsCount = consolidatedRows.filter((r) => r.isCommonPart).length;
    const shortagesCount = consolidatedRows.filter((r) => r.hasShortage).length;
    const totalGrossReq = consolidatedRows.reduce((sum, r) => sum + r.selectedScopeGrossReq, 0);
    const totalInwardPromised = consolidatedRows.reduce((sum, r) => sum + r.selectedScopeInward, 0);
    const totalDeficitQty = consolidatedRows.reduce((sum, r) => sum + r.selectedScopeDeficit, 0);

    return {
      totalComponents,
      commonPartsCount,
      shortagesCount,
      totalGrossReq,
      totalInwardPromised,
      totalDeficitQty
    };
  }, [consolidatedRows]);

  // ==========================================================================
  // TEMPLATE GENERATION & EXCEL DOWNLOAD FUNCTIONS
  // ==========================================================================

  // 1. Download Blank Standard Excel Template (.xlsx)
  const handleDownloadBlankTemplate = () => {
    const headers = [
      'PO_Number',
      'Component_Code',
      'Component_Description',
      'Vendor_Code',
      'Vendor_Name',
      'Buyer_Name',
      'Expected_Delivery_Date',
      'Week_No',
      'Promised_Quantity',
      'Delivery_Status',
      'Carrier_Or_Tracking',
      'Notes'
    ];

    const sampleRows = [
      {
        PO_Number: 'PO-2026-8801',
        Component_Code: '100201',
        Component_Description: 'Die-Cast Aluminum Housing (Panther)',
        Vendor_Code: 'V-1020',
        Vendor_Name: 'CastAlu Technologies GmbH',
        Buyer_Name: 'Rajesh Kumar',
        Expected_Delivery_Date: `${selectedMonth}-10`,
        Week_No: activeWeek?.weekNo || 1,
        Promised_Quantity: 3500,
        Delivery_Status: 'CONFIRMED_ON_TRACK',
        Carrier_Or_Tracking: 'Direct Express Truck (TN-04-AB-9821)',
        Notes: 'Confirmed by vendor for Monday morning dock receipt'
      },
      {
        PO_Number: 'PO-2026-8802',
        Component_Code: '200405',
        Component_Description: 'Composite Carbon Sliding Vane (3-Set)',
        Vendor_Code: 'V-1030',
        Vendor_Name: 'CarbonTech Materials AG',
        Buyer_Name: 'Ananya Sharma',
        Expected_Delivery_Date: `${selectedMonth}-12`,
        Week_No: activeWeek?.weekNo || 1,
        Promised_Quantity: 4000,
        Delivery_Status: 'CONFIRMED_ON_TRACK',
        Carrier_Or_Tracking: 'DHL Freight Logistics',
        Notes: 'Weekly batch shipment'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleRows, { header: headers });
    worksheet['!cols'] = [
      { wch: 16 }, // PO_Number
      { wch: 16 }, // Component_Code
      { wch: 38 }, // Component_Description
      { wch: 14 }, // Vendor_Code
      { wch: 28 }, // Vendor_Name
      { wch: 18 }, // Buyer_Name
      { wch: 24 }, // Expected_Delivery_Date
      { wch: 10 }, // Week_No
      { wch: 18 }, // Promised_Quantity
      { wch: 22 }, // Delivery_Status
      { wch: 30 }, // Carrier_Or_Tracking
      { wch: 40 }  // Notes
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Schedule_Template');

    const fileName = `SAP_Vendor_Delivery_Schedule_Blank_Template_${selectedMonth}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    showNotification(`Blank Excel template generated: ${fileName}`, 'success');
  };

  // 2. Download Pre-filled Template with Consolidated RM Requirements & Shortages (.xlsx)
  const handleDownloadPrefilledTemplate = () => {
    const scopeLabel = scopeMode === 'WEEK' ? `Week_${activeWeek?.weekNo || 1}` : 'Full_Month';
    const targetRows = consolidatedRows;

    const dataToExport = targetRows.map((r, idx) => {
      // Suggest delivery date within active week or month
      const suggestedDate = scopeMode === 'WEEK' && activeWeek?.startDate
        ? activeWeek.startDate
        : `${selectedMonth}-10`;

      // Suggest quantity matching the deficit, or standard gross requirement
      const suggestedQty = r.hasShortage
        ? r.selectedScopeDeficit
        : r.selectedScopeGrossReq > 0
        ? r.selectedScopeGrossReq
        : 1000;

      return {
        PO_Number: `PO-${selectedMonth.replace('-', '')}-${(9000 + idx).toString()}`,
        Component_Code: r.componentCode,
        Component_Description: r.componentDescription,
        Category: r.category,
        Is_Common_Part: r.isCommonPart ? `YES (${r.sharedInFGsCount} FGs)` : 'NO',
        Vendor_Code: r.vendorCode,
        Vendor_Name: r.vendorName,
        Buyer_Name: r.buyerName,
        Lead_Time_Days: r.leadTimeDays,
        MB52_Available_Stock: r.availableStock,
        Gross_Requirement: r.selectedScopeGrossReq,
        Current_Scheduled_Inward: r.selectedScopeInward,
        Deficit_Shortage: r.selectedScopeDeficit,
        Expected_Delivery_Date: suggestedDate,
        Week_No: activeWeek?.weekNo || 1,
        Promised_Quantity: suggestedQty,
        Delivery_Status: r.hasShortage ? 'CONFIRMED_ON_TRACK' : 'CONFIRMED_ON_TRACK',
        Carrier_Or_Tracking: 'Road Logistics Standard',
        Notes: r.isCommonPart
          ? `Shared in ${r.sharedInFGsCount} Finished Goods. Maintain priority inward.`
          : 'Standard production replenishment'
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    worksheet['!cols'] = [
      { wch: 18 }, // PO_Number
      { wch: 16 }, // Component_Code
      { wch: 38 }, // Component_Description
      { wch: 10 }, // Category
      { wch: 16 }, // Is_Common_Part
      { wch: 14 }, // Vendor_Code
      { wch: 28 }, // Vendor_Name
      { wch: 18 }, // Buyer_Name
      { wch: 14 }, // Lead_Time_Days
      { wch: 20 }, // MB52_Available_Stock
      { wch: 18 }, // Gross_Requirement
      { wch: 24 }, // Current_Scheduled_Inward
      { wch: 18 }, // Deficit_Shortage
      { wch: 22 }, // Expected_Delivery_Date
      { wch: 10 }, // Week_No
      { wch: 18 }, // Promised_Quantity
      { wch: 22 }, // Delivery_Status
      { wch: 26 }, // Carrier_Or_Tracking
      { wch: 40 }  // Notes
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Consolidated_Requirements');

    const fileName = `SAP_RM_Requirements_PreFilled_Schedule_${selectedMonth}_${scopeLabel}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    showNotification(`Pre-filled Excel template generated: ${fileName}`, 'success');
  };

  // 3. Export Current Consolidated Matrix to Excel Report
  const handleExportConsolidatedReport = () => {
    const dataToExport = filteredRows.map((r) => {
      const rowObj: Record<string, string | number> = {
        'Component Code': r.componentCode,
        'Description': r.componentDescription,
        'Category': r.category,
        'UOM': r.uom,
        'Is Common Item': r.isCommonPart ? `Shared in ${r.sharedInFGsCount} FGs` : 'Single FG',
        'Buyer': r.buyerName,
        'Vendor': r.vendorName,
        'Vendor Code': r.vendorCode,
        'MB52 Physical Stock': r.totalPhysicalStock,
        'Frozen Reserved': r.reservedStock,
        'Available Stock': r.availableStock
      };

      // Add weekly breakdown columns
      monthWeeks.forEach((w) => {
        rowObj[`${w.weekLabel} Gross Req`] = r.weeklyGrossReq[w.id] || 0;
        rowObj[`${w.weekLabel} Inward Inbound`] = r.weeklyInwardDeliveries[w.id] || 0;
      });

      rowObj['Total Month Gross Demand'] = r.monthTotalGrossReq;
      rowObj['Total Month Inward Scheduled'] = r.monthTotalInward;
      rowObj['Ending Balance'] = r.monthEndingBalance;
      rowObj['Current Status'] = r.hasShortage ? 'SHORTAGE_DEFICIT' : 'ADEQUATE';

      return rowObj;
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Consolidated_RM_Matrix');

    const fileName = `Consolidated_RM_Schedule_Matrix_${selectedMonth}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    showNotification(`Report exported: ${fileName}`, 'success');
  };

  // ==========================================================================
  // PARSE & UPLOAD EXCEL / CSV FILES
  // ==========================================================================

  const parseRawScheduleData = (rawRows: any[]) => {
    const parsed: ParsedScheduleRow[] = [];

    rawRows.forEach((row, idx) => {
      // Normalize field keys (case-insensitive & space/underscore insensitive)
      const normalizedRow: Record<string, any> = {};
      Object.keys(row).forEach((key) => {
        const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        normalizedRow[cleanKey] = row[key];
      });

      // Extract values with flexible key fallbacks
      const compCode = String(
        normalizedRow['componentcode'] ||
        normalizedRow['component'] ||
        normalizedRow['partnumber'] ||
        normalizedRow['material'] ||
        normalizedRow['itemcode'] ||
        ''
      ).trim();

      const poNumber = String(
        normalizedRow['ponumber'] ||
        normalizedRow['po'] ||
        normalizedRow['scheduleref'] ||
        normalizedRow['schedulerefid'] ||
        `PO-UP-${Date.now().toString().slice(-4)}-${idx + 1}`
      ).trim();

      let promisedQty = Number(
        normalizedRow['promisedquantity'] ||
        normalizedRow['promisedqty'] ||
        normalizedRow['quantity'] ||
        normalizedRow['qty'] ||
        normalizedRow['inwardqty'] ||
        0
      );

      let deliveryDateStr = String(
        normalizedRow['expecteddeliverydate'] ||
        normalizedRow['deliverydate'] ||
        normalizedRow['date'] ||
        normalizedRow['arrivaldate'] ||
        ''
      ).trim();

      // Handle Excel serial date numbers (e.g., 46245 -> YYYY-MM-DD)
      if (!isNaN(Number(deliveryDateStr)) && Number(deliveryDateStr) > 40000) {
        const jsDate = new Date((Number(deliveryDateStr) - 25569) * 86400 * 1000);
        deliveryDateStr = jsDate.toISOString().split('T')[0];
      }

      // If empty date, fallback to active week's start date or current month
      if (!deliveryDateStr || deliveryDateStr.length < 5) {
        deliveryDateStr = activeWeek?.startDate || `${selectedMonth}-10`;
      }

      // Extract or match Week
      let weekNoVal = Number(normalizedRow['weekno'] || normalizedRow['week'] || 0);
      let matchedWeek = monthWeeks.find((w) => isDateInWeek(deliveryDateStr, w));
      if (!matchedWeek && weekNoVal > 0) {
        matchedWeek = monthWeeks.find((w) => w.weekNo === weekNoVal);
      }
      if (!matchedWeek) {
        matchedWeek = activeWeek || monthWeeks[0];
      }

      // Lookup component in master BOM
      const matchedBOM = boms.find((b) => b.componentCode === compCode);
      const matchedVB = vendorBuyers.find((vb) => vb.suppliedComponents.includes(compCode));

      const compDesc = String(
        normalizedRow['componentdescription'] ||
        normalizedRow['description'] ||
        matchedBOM?.componentDescription ||
        'Direct Component'
      );

      const vendorCode = String(
        normalizedRow['vendorcode'] ||
        matchedVB?.vendorCode ||
        'V-1000'
      );

      const vendorName = String(
        normalizedRow['vendorname'] ||
        matchedVB?.vendorName ||
        'Designated Supplier'
      );

      const buyerName = String(
        normalizedRow['buyername'] ||
        matchedVB?.buyerName ||
        'Rajesh Kumar (Buyer)'
      );

      let rawStatus = String(
        normalizedRow['deliverystatus'] ||
        normalizedRow['status'] ||
        'CONFIRMED_ON_TRACK'
      ).toUpperCase().replace(/\s+/g, '_');

      let deliveryStatus: DeliveryCommitmentStatus = 'CONFIRMED_ON_TRACK';
      if (rawStatus.includes('TRANSIT')) deliveryStatus = 'IN_TRANSIT';
      else if (rawStatus.includes('PARTIAL')) deliveryStatus = 'PARTIAL_PROMISE';
      else if (rawStatus.includes('DELAY') || rawStatus.includes('RISK')) deliveryStatus = 'DELAYED_AT_RISK';
      else if (rawStatus.includes('CANCEL')) deliveryStatus = 'CANCELLED';

      const carrierOrTracking = String(
        normalizedRow['carrierortracking'] ||
        normalizedRow['carrier'] ||
        normalizedRow['tracking'] ||
        'Direct Road Logistics'
      );

      const notes = String(
        normalizedRow['notes'] ||
        normalizedRow['remark'] ||
        'Uploaded via Excel bulk schedule updater'
      );

      // Validation
      let isValid = true;
      let validationStatus: 'VALID' | 'WARNING' | 'ERROR' = 'VALID';
      let validationMessage = 'Valid & verified against Master Data';

      if (!compCode) {
        isValid = false;
        validationStatus = 'ERROR';
        validationMessage = 'Missing Component Code';
      } else if (!matchedBOM) {
        validationStatus = 'WARNING';
        validationMessage = 'Component Code not found in BOM master (will register as standalone)';
      }

      if (promisedQty <= 0) {
        isValid = false;
        validationStatus = 'ERROR';
        validationMessage = 'Promised quantity must be greater than 0';
      }

      parsed.push({
        rowIndex: idx + 1,
        poNumber,
        componentCode: compCode,
        componentDescription: compDesc,
        vendorCode,
        vendorName,
        buyerName,
        expectedDeliveryDate: deliveryDateStr,
        weekNo: matchedWeek?.weekNo,
        weekId: matchedWeek?.id,
        promisedQty,
        deliveryStatus,
        carrierOrTracking,
        notes,
        isValid,
        validationStatus,
        validationMessage
      });
    });

    setParsedRows(parsed);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadFileName(file.name);
    const fileExt = file.name.split('.').pop()?.toLowerCase();

    if (fileExt === 'xlsx' || fileExt === 'xls') {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const bstr = evt.target?.result;
          const workbook = XLSX.read(bstr, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json(sheet);
          parseRawScheduleData(json);
        } catch (err) {
          console.error(err);
          alert('Failed to parse Excel file. Please ensure it is a valid .xlsx or .xls file.');
        }
      };
      reader.readAsBinaryString(file);
    } else {
      // CSV parse
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          parseRawScheduleData(results.data);
        },
        error: (error) => {
          alert(`CSV Parse Error: ${error.message}`);
        }
      });
    }
  };

  const handleParsePastedText = () => {
    if (!pastedText.trim()) {
      alert('Please paste CSV or tab-separated data from Excel into the text box.');
      return;
    }

    Papa.parse(pastedText.trim(), {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        parseRawScheduleData(results.data);
        setUploadFileName('Pasted Clipboard Spreadsheet Text');
      },
      error: (error) => {
        alert(`Parsing error: ${error.message}`);
      }
    });
  };

  // Apply parsed rows to live state with change audit logs
  const handleApplyUploadSchedules = () => {
    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      alert('No valid rows to import. Please resolve error rows first.');
      return;
    }

    const now = new Date();
    const formattedTimestamp = `${now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    // Convert parsed rows into VendorDeliverySchedule items
    const newSchedules: VendorDeliverySchedule[] = validRows.map((r, idx) => ({
      id: `sch-up-${Date.now()}-${idx + 1}`,
      poNumber: r.poNumber,
      componentCode: r.componentCode,
      vendorCode: r.vendorCode,
      vendorName: r.vendorName,
      buyerName: r.buyerName,
      expectedDeliveryDate: r.expectedDeliveryDate,
      weekId: r.weekId || activeWeek?.id || 'w-1',
      promisedQty: r.promisedQty,
      carrierOrTracking: r.carrierOrTracking,
      deliveryStatus: r.deliveryStatus,
      notes: r.notes
    }));

    // Create Audit Log entries
    const newAuditLogs: VendorDeliveryScheduleChangeLog[] = validRows.map((r, idx) => ({
      id: `log-bulk-${Date.now()}-${idx + 1}`,
      scheduleId: `sch-up-${Date.now()}-${idx + 1}`,
      poNumber: r.poNumber,
      componentCode: r.componentCode,
      componentDescription: r.componentDescription,
      vendorName: r.vendorName,
      changedBy: uploadPlannerName,
      changedAt: formattedTimestamp,
      fieldChanged: 'Bulk Excel Schedule Import',
      oldValue: 'Prior Schedule State',
      newValue: `+${r.promisedQty.toLocaleString()} units on ${r.expectedDeliveryDate} (${r.deliveryStatus})`,
      reasonForChange: `Excel bulk schedule update (${uploadFileName || 'Spreadsheet Import'}) for ${uploadScope === 'SELECTED_WEEK' ? activeWeek?.weekLabel : selectedMonth}.`
    }));

    if (importMode === 'OVERWRITE') {
      // Filter out existing schedules for the scope
      let remaining: VendorDeliverySchedule[] = [];
      if (uploadScope === 'SELECTED_WEEK' && activeWeek) {
        remaining = vendorDeliverySchedules.filter((s) => s.weekId !== activeWeek.id);
      } else {
        // Full month overwrite
        const monthWeekIds = new Set(monthWeeks.map((w) => w.id));
        remaining = vendorDeliverySchedules.filter((s) => !monthWeekIds.has(s.weekId));
      }
      onUpdateVendorDeliverySchedules([...remaining, ...newSchedules]);
    } else {
      // Append / Merge mode
      onUpdateVendorDeliverySchedules([...vendorDeliverySchedules, ...newSchedules]);
    }

    onUpdateDeliveryScheduleChangeLogs([...newAuditLogs, ...deliveryScheduleChangeLogs]);
    setIsUploadModalOpen(false);
    setParsedRows([]);
    setPastedText('');
    setUploadFileName('');

    showNotification(
      `Successfully uploaded and applied ${newSchedules.length} vendor delivery schedules (${validRows.reduce((sum, r) => sum + r.promisedQty, 0).toLocaleString()} units)!`,
      'success'
    );
  };

  // ==========================================================================
  // SINGLE SCHEDULE CREATION & EDITING
  // ==========================================================================

  const handleOpenAddSingleModal = (comp?: ConsolidatedComponentRow, existingSchedule?: VendorDeliverySchedule) => {
    if (existingSchedule) {
      setSingleScheduleForm({
        id: existingSchedule.id,
        poNumber: existingSchedule.poNumber,
        componentCode: existingSchedule.componentCode,
        componentDescription: comp?.componentDescription || 'Component',
        vendorCode: existingSchedule.vendorCode,
        vendorName: existingSchedule.vendorName,
        buyerName: existingSchedule.buyerName,
        expectedDeliveryDate: existingSchedule.expectedDeliveryDate,
        weekId: existingSchedule.weekId,
        promisedQty: existingSchedule.promisedQty,
        carrierOrTracking: existingSchedule.carrierOrTracking || 'Direct Express Truck',
        deliveryStatus: existingSchedule.deliveryStatus,
        notes: existingSchedule.notes || '',
        reasonForChange: 'Rescheduled arrival date and quantity for production requirements.'
      });
    } else if (comp) {
      const defaultDate = scopeMode === 'WEEK' && activeWeek?.startDate
        ? activeWeek.startDate
        : `${selectedMonth}-10`;

      setSingleScheduleForm({
        poNumber: `PO-${selectedMonth.replace('-', '')}-${Math.floor(1000 + Math.random() * 9000)}`,
        componentCode: comp.componentCode,
        componentDescription: comp.componentDescription,
        vendorCode: comp.vendorCode,
        vendorName: comp.vendorName,
        buyerName: comp.buyerName,
        expectedDeliveryDate: defaultDate,
        weekId: activeWeek?.id || monthWeeks[0]?.id || 'w-1',
        promisedQty: comp.hasShortage ? comp.selectedScopeDeficit : 1500,
        carrierOrTracking: 'Direct Road Express',
        deliveryStatus: 'CONFIRMED_ON_TRACK',
        notes: comp.isCommonPart
          ? `Common part commitment shared in ${comp.sharedInFGsCount} FGs`
          : 'Replenishment for weekly build target',
        reasonForChange: 'New vendor delivery commitment assigned.'
      });
    } else {
      const firstComp = consolidatedRows[0];
      setSingleScheduleForm({
        poNumber: `PO-${selectedMonth.replace('-', '')}-${Math.floor(1000 + Math.random() * 9000)}`,
        componentCode: firstComp?.componentCode || '100201',
        componentDescription: firstComp?.componentDescription || 'Component',
        vendorCode: firstComp?.vendorCode || 'V-1020',
        vendorName: firstComp?.vendorName || 'CastAlu Technologies',
        buyerName: firstComp?.buyerName || 'Rajesh Kumar',
        expectedDeliveryDate: activeWeek?.startDate || `${selectedMonth}-10`,
        weekId: activeWeek?.id || 'w-1',
        promisedQty: 2000,
        carrierOrTracking: 'Direct Road Express',
        deliveryStatus: 'CONFIRMED_ON_TRACK',
        notes: '',
        reasonForChange: 'Manual schedule entry by buyer.'
      });
    }
    setIsSingleScheduleModalOpen(true);
  };

  const handleSaveSingleSchedule = (e: React.FormEvent) => {
    e.preventDefault();

    const now = new Date();
    const formattedTimestamp = `${now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    if (singleScheduleForm.id) {
      // Edit existing schedule
      const updated = vendorDeliverySchedules.map((s) =>
        s.id === singleScheduleForm.id
          ? {
              ...s,
              poNumber: singleScheduleForm.poNumber,
              componentCode: singleScheduleForm.componentCode,
              vendorCode: singleScheduleForm.vendorCode,
              vendorName: singleScheduleForm.vendorName,
              buyerName: singleScheduleForm.buyerName,
              expectedDeliveryDate: singleScheduleForm.expectedDeliveryDate,
              weekId: singleScheduleForm.weekId,
              promisedQty: Number(singleScheduleForm.promisedQty),
              carrierOrTracking: singleScheduleForm.carrierOrTracking,
              deliveryStatus: singleScheduleForm.deliveryStatus,
              notes: singleScheduleForm.notes
            }
          : s
      );

      const logEntry: VendorDeliveryScheduleChangeLog = {
        id: `log-${Date.now()}`,
        scheduleId: singleScheduleForm.id,
        poNumber: singleScheduleForm.poNumber,
        componentCode: singleScheduleForm.componentCode,
        componentDescription: singleScheduleForm.componentDescription,
        vendorName: singleScheduleForm.vendorName,
        changedBy: uploadPlannerName,
        changedAt: formattedTimestamp,
        fieldChanged: 'Delivery Commitment Modified',
        oldValue: 'Previous Commitment State',
        newValue: `${singleScheduleForm.promisedQty} pcs on ${singleScheduleForm.expectedDeliveryDate} (${singleScheduleForm.deliveryStatus})`,
        reasonForChange: singleScheduleForm.reasonForChange || 'Updated delivery commitment date/qty.'
      };

      onUpdateVendorDeliverySchedules(updated);
      onUpdateDeliveryScheduleChangeLogs([logEntry, ...deliveryScheduleChangeLogs]);
      showNotification(`Delivery schedule for ${singleScheduleForm.componentCode} updated successfully.`, 'success');
    } else {
      // Create new schedule
      const newSchedule: VendorDeliverySchedule = {
        id: `sch-${Date.now()}`,
        poNumber: singleScheduleForm.poNumber,
        componentCode: singleScheduleForm.componentCode,
        vendorCode: singleScheduleForm.vendorCode,
        vendorName: singleScheduleForm.vendorName,
        buyerName: singleScheduleForm.buyerName,
        expectedDeliveryDate: singleScheduleForm.expectedDeliveryDate,
        weekId: singleScheduleForm.weekId,
        promisedQty: Number(singleScheduleForm.promisedQty),
        carrierOrTracking: singleScheduleForm.carrierOrTracking,
        deliveryStatus: singleScheduleForm.deliveryStatus,
        notes: singleScheduleForm.notes
      };

      const logEntry: VendorDeliveryScheduleChangeLog = {
        id: `log-${Date.now()}`,
        scheduleId: newSchedule.id,
        poNumber: newSchedule.poNumber,
        componentCode: newSchedule.componentCode,
        componentDescription: singleScheduleForm.componentDescription,
        vendorName: newSchedule.vendorName,
        changedBy: uploadPlannerName,
        changedAt: formattedTimestamp,
        fieldChanged: 'New Delivery Commitment Added',
        oldValue: 'None (0 pcs)',
        newValue: `+${newSchedule.promisedQty} pcs on ${newSchedule.expectedDeliveryDate}`,
        reasonForChange: singleScheduleForm.reasonForChange || 'New schedule commitment created by buyer.'
      };

      onUpdateVendorDeliverySchedules([...vendorDeliverySchedules, newSchedule]);
      onUpdateDeliveryScheduleChangeLogs([logEntry, ...deliveryScheduleChangeLogs]);
      showNotification(`New delivery schedule created for ${singleScheduleForm.componentCode} (+${newSchedule.promisedQty.toLocaleString()} units).`, 'success');
    }

    setIsSingleScheduleModalOpen(false);
  };

  const handleDeleteSchedule = (scheduleId: string) => {
    const target = vendorDeliverySchedules.find((s) => s.id === scheduleId);
    if (!target) return;

    if (window.confirm(`Are you sure you want to cancel and remove PO #${target.poNumber || target.id} for component ${target.componentCode}?`)) {
      const now = new Date();
      const formattedTimestamp = `${now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

      const logEntry: VendorDeliveryScheduleChangeLog = {
        id: `log-del-${Date.now()}`,
        scheduleId: target.id,
        poNumber: target.poNumber,
        componentCode: target.componentCode,
        vendorName: target.vendorName,
        changedBy: uploadPlannerName,
        changedAt: formattedTimestamp,
        fieldChanged: 'Delivery Commitment Deleted/Cancelled',
        oldValue: `${target.promisedQty} pcs on ${target.expectedDeliveryDate}`,
        newValue: 'REMOVED (0 pcs)',
        reasonForChange: 'Schedule commitment cancelled and deleted from system by user.'
      };

      onUpdateVendorDeliverySchedules(vendorDeliverySchedules.filter((s) => s.id !== scheduleId));
      onUpdateDeliveryScheduleChangeLogs([logEntry, ...deliveryScheduleChangeLogs]);
      showNotification(`Schedule PO #${target.poNumber} removed successfully.`, 'info');
    }
  };

  // 1-Click Auto-Fill Commitments for all Deficits
  const handleAutoFillAllDeficits = () => {
    const deficitItems = consolidatedRows.filter((r) => r.hasShortage);
    if (deficitItems.length === 0) {
      alert('No component shortages found for the current scope. All requirements are already adequately covered!');
      return;
    }

    if (
      !window.confirm(
        `Generate suggested delivery commitments for all ${deficitItems.length} shortage items (${summaryMetrics.totalDeficitQty.toLocaleString()} total units)?`
      )
    ) {
      return;
    }

    const defaultDate = scopeMode === 'WEEK' && activeWeek?.startDate
      ? activeWeek.startDate
      : `${selectedMonth}-10`;

    const now = new Date();
    const formattedTimestamp = `${now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    const generatedSchedules: VendorDeliverySchedule[] = deficitItems.map((comp, idx) => ({
      id: `sch-auto-${Date.now()}-${idx + 1}`,
      poNumber: `PO-AUTO-${selectedMonth.replace('-', '')}-${(8000 + idx).toString()}`,
      componentCode: comp.componentCode,
      vendorCode: comp.vendorCode,
      vendorName: comp.vendorName,
      buyerName: comp.buyerName,
      expectedDeliveryDate: defaultDate,
      weekId: activeWeek?.id || monthWeeks[0]?.id || 'w-1',
      promisedQty: comp.selectedScopeDeficit,
      carrierOrTracking: 'Expedited Express Freight',
      deliveryStatus: 'CONFIRMED_ON_TRACK',
      notes: `Auto-generated commitment matching deficit of ${comp.selectedScopeDeficit.toLocaleString()} ${comp.uom}`
    }));

    const generatedLogs: VendorDeliveryScheduleChangeLog[] = generatedSchedules.map((s, idx) => ({
      id: `log-auto-${Date.now()}-${idx + 1}`,
      scheduleId: s.id,
      poNumber: s.poNumber,
      componentCode: s.componentCode,
      componentDescription: deficitItems[idx]?.componentDescription,
      vendorName: s.vendorName,
      changedBy: uploadPlannerName,
      changedAt: formattedTimestamp,
      fieldChanged: 'Auto-Fill Shortage Coverage',
      oldValue: 'Deficit / Shortage Uncovered',
      newValue: `+${s.promisedQty.toLocaleString()} units on ${s.expectedDeliveryDate}`,
      reasonForChange: '1-Click auto-fill coverage generated by Supply Planner.'
    }));

    onUpdateVendorDeliverySchedules([...vendorDeliverySchedules, ...generatedSchedules]);
    onUpdateDeliveryScheduleChangeLogs([...generatedLogs, ...deliveryScheduleChangeLogs]);
    showNotification(`Auto-scheduled ${generatedSchedules.length} delivery commitments covering all deficits!`, 'success');
  };

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`p-3 rounded-lg border flex items-center justify-between text-xs font-semibold shadow-md transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border-emerald-700'
              : notification.type === 'error'
              ? 'bg-rose-950/90 text-rose-200 border-rose-700'
              : 'bg-blue-950/90 text-blue-200 border-blue-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* TOP HEADER CONTROLS & SCOPE TOOLBAR */}
      <div className="bg-slate-900 text-white p-3.5 rounded-xl border border-slate-800 shadow-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Left: Title & Persona Indicator */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-9 h-9 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 font-bold shadow-md">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-white">
                  Vendor Delivery Schedule Updation & Consolidated RM Matrix
                </h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase">
                  Supply / Buyer Mode
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Direct Excel template download, bulk spreadsheet schedule upload & consolidated multi-FG requirement management
              </p>
            </div>
          </div>

          {/* Right: Quick Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Download Template Menu */}
            <div className="relative inline-block group">
              <button
                type="button"
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg shadow-sm cursor-pointer transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-blue-400" />
                <span>Download Template</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>
              <div className="absolute right-0 top-full mt-1 w-64 bg-slate-900 border border-slate-700 rounded-lg shadow-xl py-1 z-30 hidden group-hover:block divide-y divide-slate-800">
                <button
                  type="button"
                  onClick={handleDownloadPrefilledTemplate}
                  className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 hover:text-white flex flex-col gap-0.5 cursor-pointer"
                >
                  <span className="font-semibold text-emerald-400 flex items-center gap-1">
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Pre-filled Template (.xlsx)
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Pre-populated with current week/month RM requirements & shortages
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadBlankTemplate}
                  className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 hover:text-white flex flex-col gap-0.5 cursor-pointer"
                >
                  <span className="font-semibold text-blue-400 flex items-center gap-1">
                    <FileCheck className="w-3.5 h-3.5" />
                    Blank Standard Template (.xlsx)
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Empty template with standard SAP columns & sample rows
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleExportConsolidatedReport}
                  className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 hover:text-white flex flex-col gap-0.5 cursor-pointer"
                >
                  <span className="font-semibold text-amber-400 flex items-center gap-1">
                    <Download className="w-3.5 h-3.5" />
                    Export Full RM Matrix (.xlsx)
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Full weekly gross demand & scheduled inward report
                  </span>
                </button>
              </div>
            </div>

            {/* Change History & Audit Drawer Trigger */}
            <button
              type="button"
              onClick={() => handleOpenHistoryDrawer({ title: 'Vendor Delivery Schedule & PO Change History' })}
              title="Open change history drawer with previous vs current values and planner signatures"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-300 bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/60 rounded-lg shadow-sm cursor-pointer transition-colors"
            >
              <History className="w-3.5 h-3.5 text-indigo-400" />
              <span>Change History ({deliveryScheduleChangeLogs.length})</span>
            </button>

            {/* Direct Upload Excel Button */}
            <button
              type="button"
              onClick={() => setIsUploadModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-sm cursor-pointer transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Excel / CSV Schedule</span>
            </button>

            {/* Add Single Commitment Button */}
            <button
              type="button"
              onClick={() => handleOpenAddSingleModal()}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-sm cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Manual PO Entry</span>
            </button>

            {/* Auto-Fill Commitments */}
            {summaryMetrics.shortagesCount > 0 && (
              <button
                type="button"
                onClick={handleAutoFillAllDeficits}
                title="1-Click auto-fill delivery schedules for all uncovered shortages"
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-amber-300 bg-amber-950/70 hover:bg-amber-900/80 border border-amber-700/60 rounded-lg shadow-sm cursor-pointer transition-colors"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Auto-Fill {summaryMetrics.shortagesCount} Shortages</span>
              </button>
            )}
          </div>
        </div>

        {/* TIME SCOPE & MONTH SELECTION BAR */}
        <div className="mt-3 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Scope Mode Switcher: By Week vs Complete Month */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Planning Horizon:</span>
            <div className="bg-slate-950 p-1 rounded-lg border border-slate-800 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setScopeMode('WEEK')}
                className={`px-3 py-1 rounded-md font-semibold text-xs transition-colors cursor-pointer ${
                  scopeMode === 'WEEK'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Weekly Scope ({activeWeek?.weekLabel || 'Current Week'})
              </button>
              <button
                type="button"
                onClick={() => setScopeMode('MONTH')}
                className={`px-3 py-1 rounded-md font-semibold text-xs transition-colors cursor-pointer ${
                  scopeMode === 'MONTH'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Complete Month Overview ({selectedMonth})
              </button>
            </div>

            {/* If Weekly Scope, show Week Dropdown */}
            {scopeMode === 'WEEK' && (
              <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1">
                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                <select
                  value={selectedWeekId}
                  onChange={(e) => setSelectedWeekId(e.target.value)}
                  className="bg-transparent border-none text-white text-xs font-semibold focus:outline-none cursor-pointer"
                >
                  {monthWeeks.map((w) => (
                    <option key={w.id} value={w.id} className="bg-slate-900 text-white">
                      {w.weekLabel} ({w.startDate} to {w.endDate}, {w.daysCount}d)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Month Selector & Role Indicator */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1">
              <span className="text-slate-400 font-medium">Month:</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => onSelectMonth(e.target.value)}
                className="bg-transparent border-none text-white text-xs font-mono font-bold focus:outline-none cursor-pointer"
              />
            </div>

            <div className="flex items-center gap-1.5 text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
              <span>Persona: </span>
              <strong className="text-slate-200">Supply Planner / Buyer</strong>
            </div>
          </div>
        </div>
      </div>

      {/* KPI SUMMARY CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Total Components</div>
          <div className="text-xl font-bold text-slate-900 mt-1 font-mono">
            {summaryMetrics.totalComponents}{' '}
            <span className="text-xs text-slate-400 font-normal">items</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Across all Finished Goods</div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-blue-200 shadow-xs bg-blue-50/20">
          <div className="text-[11px] text-blue-800 font-medium uppercase tracking-wider flex items-center gap-1">
            <Share2 className="w-3 h-3 text-blue-600" />
            Common Parts (Multi-FG)
          </div>
          <div className="text-xl font-bold text-blue-900 mt-1 font-mono">
            {summaryMetrics.commonPartsCount}{' '}
            <span className="text-xs text-blue-700 font-normal">shared</span>
          </div>
          <div className="text-[10px] text-blue-600 mt-0.5">Shared in multiple FGs</div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">
            {scopeMode === 'WEEK' ? `Gross Req (${activeWeek?.weekLabel})` : 'Total Month Gross Req'}
          </div>
          <div className="text-xl font-bold text-slate-900 mt-1 font-mono">
            {summaryMetrics.totalGrossReq.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Production requirement</div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-emerald-200 shadow-xs bg-emerald-50/20">
          <div className="text-[11px] text-emerald-800 font-medium uppercase tracking-wider">
            Scheduled Inward Delivery
          </div>
          <div className="text-xl font-bold text-emerald-700 mt-1 font-mono">
            +{summaryMetrics.totalInwardPromised.toLocaleString()}
          </div>
          <div className="text-[10px] text-emerald-600 mt-0.5">Promised by vendors</div>
        </div>

        <div
          className={`p-3 rounded-xl border shadow-xs ${
            summaryMetrics.shortagesCount > 0
              ? 'bg-rose-50 border-rose-200'
              : 'bg-emerald-50 border-emerald-200'
          }`}
        >
          <div
            className={`text-[11px] font-medium uppercase tracking-wider flex items-center gap-1 ${
              summaryMetrics.shortagesCount > 0 ? 'text-rose-800' : 'text-emerald-800'
            }`}
          >
            {summaryMetrics.shortagesCount > 0 && <AlertCircle className="w-3 h-3 text-rose-600" />}
            Deficit / Shortages
          </div>
          <div
            className={`text-xl font-bold mt-1 font-mono ${
              summaryMetrics.shortagesCount > 0 ? 'text-rose-700' : 'text-emerald-700'
            }`}
          >
            {summaryMetrics.shortagesCount}{' '}
            <span className="text-xs font-normal">
              {summaryMetrics.shortagesCount === 1 ? 'part' : 'parts'}
            </span>
          </div>
          <div className="text-[10px] mt-0.5 font-medium text-rose-600">
            {summaryMetrics.shortagesCount > 0
              ? `-${summaryMetrics.totalDeficitQty.toLocaleString()} units net gap`
              : '100% adequate coverage'}
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Active PO Schedules</div>
          <div className="text-xl font-bold text-slate-900 mt-1 font-mono">
            {vendorDeliverySchedules.filter((s) => s.deliveryStatus !== 'CANCELLED').length}{' '}
            <span className="text-xs text-slate-400 font-normal">batches</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Tracked in system</div>
        </div>
      </div>

      {/* TABS & FILTER BAR */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Main Navigation Tabs */}
          <div className="flex items-center gap-2 border-b md:border-b-0 pb-2 md:pb-0 border-slate-200 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveTab('supply_risk_heatmap')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'supply_risk_heatmap'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100'
              }`}
            >
              <Flame className={`w-3.5 h-3.5 ${activeTab === 'supply_risk_heatmap' ? 'text-white animate-pulse' : 'text-rose-600'}`} />
              <span>Supply Risk Heatmap</span>
              {vendorDeliverySchedules.some((s) => s.deliveryStatus === 'DELAYED_AT_RISK' || s.deliveryStatus === 'CRITICAL_NO_PO') && (
                <span className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${activeTab === 'supply_risk_heatmap' ? 'bg-white text-rose-800' : 'bg-rose-600 text-white'}`}>
                  {vendorDeliverySchedules.filter((s) => s.deliveryStatus === 'DELAYED_AT_RISK' || s.deliveryStatus === 'CRITICAL_NO_PO').length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('consolidated_matrix')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'consolidated_matrix'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Consolidated RM Requirements & Matrix</span>
              <span className="ml-1 px-1.5 py-0.2 rounded text-[10px] bg-white/20">
                {filteredRows.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('schedules_list')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'schedules_list'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              <span>All Active PO Delivery Schedules</span>
              <span className="ml-1 px-1.5 py-0.2 rounded text-[10px] bg-slate-200 text-slate-800 font-mono">
                {vendorDeliverySchedules.filter((s) => s.deliveryStatus !== 'CANCELLED').length}
              </span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[260px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by part number, name, vendor, buyer, FG..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Secondary Filter Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* Buyer Filter */}
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg">
              <Users className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-slate-500 font-medium">Buyer:</span>
              <select
                value={selectedBuyer}
                onChange={(e) => setSelectedBuyer(e.target.value)}
                className="bg-transparent border-none text-slate-800 text-xs font-semibold focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Buyers</option>
                {buyerOptions.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg">
              <span className="text-slate-500 font-medium">Category:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as any)}
                className="bg-transparent border-none text-slate-800 text-xs font-semibold focus:outline-none cursor-pointer"
              >
                <option value="ALL">All RM & PM</option>
                <option value="RM">RM Only (Raw Materials)</option>
                <option value="PM">PM Only (Packaging Materials)</option>
              </select>
            </div>

            {/* Status / Criticality Filter */}
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-slate-500 font-medium">Filter:</span>
              <select
                value={criticalityFilter}
                onChange={(e) => setCriticalityFilter(e.target.value as any)}
                className="bg-transparent border-none text-slate-800 text-xs font-semibold focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Items ({consolidatedRows.length})</option>
                <option value="SHORTAGES_ONLY">Shortages & Deficits Only ({summaryMetrics.shortagesCount})</option>
                <option value="COMMON_ONLY">Common / Shared Items Only ({summaryMetrics.commonPartsCount})</option>
                <option value="SCHEDULED_ONLY">With Scheduled Inward Deliveries</option>
              </select>
            </div>
          </div>

          <div className="text-xs text-slate-500">
            Showing <strong className="text-slate-800">{filteredRows.length}</strong> of{' '}
            {consolidatedRows.length} components
          </div>
        </div>
      </div>

      {/* TAB 0: SUPPLY RISK HEATMAP */}
      {activeTab === 'supply_risk_heatmap' && (
        <SupplyRiskHeatmap
          vendorDeliverySchedules={vendorDeliverySchedules}
          vendorBuyers={vendorBuyers}
          boms={boms}
          monthlyPlans={monthlyPlans}
          weeks={weeks}
          selectedMonth={selectedMonth}
          selectedWeekId={selectedWeekId}
          stockList={stockList}
          mb51List={mb51List}
          deliveryScheduleChangeLogs={deliveryScheduleChangeLogs}
          onOpenHistoryDrawer={(filter) => {
            setHistoryDrawerFilter(filter || null);
            setIsHistoryDrawerOpen(true);
          }}
          onOpenDeliveryModal={(componentCode, schedule) => {
            const compRow = consolidatedRows.find((r) => r.componentCode === componentCode);
            if (compRow) {
              handleOpenAddSingleModal(compRow, schedule);
            } else {
              handleOpenAddSingleModal(undefined, schedule);
            }
          }}
        />
      )}

      {/* TAB 1: CONSOLIDATED REQUIREMENTS & DELIVERY SCHEDULE MATRIX */}
      {activeTab === 'consolidated_matrix' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-semibold text-[11px]">
                  <th className="py-2.5 px-3 min-w-[200px]">Part Number & Description</th>
                  <th className="py-2.5 px-2 text-center w-16">UOM</th>
                  <th className="py-2.5 px-3 min-w-[160px]">Assigned Buyer & Vendor</th>
                  <th className="py-2.5 px-3 text-center min-w-[160px]" title="Total physical stock, reserved stock, and available stock">
                    MB52 Stock (Tot / Res / Avail)
                  </th>

                  {/* If Scope is WEEK, show Single Week Gross Req */}
                  {scopeMode === 'WEEK' && (
                    <th className="py-2.5 px-3 text-right min-w-[110px] bg-blue-50/50 text-blue-950 font-bold">
                      {activeWeek?.weekLabel} Req
                    </th>
                  )}

                  {/* If Scope is MONTH, show all 5 weeks + Month Total */}
                  {scopeMode === 'MONTH' && (
                    <>
                      {monthWeeks.map((w) => (
                        <th key={w.id} className="py-2.5 px-2 text-right font-semibold text-slate-700 min-w-[70px]">
                          {w.weekLabel}
                        </th>
                      ))}
                      <th className="py-2.5 px-3 text-right bg-blue-50/50 text-blue-950 font-bold min-w-[110px]">
                        Month Total Req
                      </th>
                    </>
                  )}

                  <th className="py-2.5 px-3 text-center min-w-[180px]" title="Promised delivery batches and inward arrival dates">
                    Scheduled Inward Deliveries
                  </th>
                  <th className="py-2.5 px-3 text-center min-w-[110px]">Net Balance</th>
                  <th className="py-2.5 px-3 text-right min-w-[150px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={scopeMode === 'MONTH' ? 8 + monthWeeks.length : 8} className="py-10 text-center text-slate-400">
                      No components matched the current filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const hasActiveInward = row.selectedScopeInward > 0;
                    return (
                      <tr
                        key={row.componentCode}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          row.hasShortage
                            ? 'bg-rose-50/30'
                            : row.isCommonPart
                            ? 'bg-blue-50/20'
                            : ''
                        }`}
                      >
                        {/* 1. Part Number, Description & Common Item Badge */}
                        <td className="py-2.5 px-3 align-middle">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-bold text-slate-900 text-xs bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                {row.componentCode}
                              </span>
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.2 rounded uppercase ${
                                  row.category === 'RM'
                                    ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                    : 'bg-teal-50 text-teal-700 border border-teal-200'
                                }`}
                              >
                                {row.category}
                              </span>
                              {row.isCommonPart && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedCommonComp(row);
                                    setIsCommonPartsModalOpen(true);
                                  }}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-100 text-blue-800 hover:bg-blue-200 border border-blue-300 cursor-pointer shadow-2xs transition-colors"
                                  title={`Common Part: Shared across ${row.sharedInFGsCount} Finished Goods. Click to view BOM usage breakdown.`}
                                >
                                  <Share2 className="w-2.5 h-2.5" />
                                  Shared ({row.sharedInFGsCount} FGs)
                                </button>
                              )}
                            </div>
                            <div className="text-xs text-slate-800 font-semibold line-clamp-1" title={row.componentDescription}>
                              {row.componentDescription}
                            </div>
                          </div>
                        </td>

                        {/* 2. UOM */}
                        <td className="py-2.5 px-2 text-center align-middle font-mono text-xs text-slate-600">
                          {row.uom}
                        </td>

                        {/* 3. Assigned Buyer & Vendor */}
                        <td className="py-2.5 px-3 align-middle">
                          <div className="flex flex-col gap-0.5 text-xs">
                            <div className="font-semibold text-slate-900 truncate max-w-[150px]" title={row.vendorName}>
                              {row.vendorName}
                            </div>
                            <div className="text-[11px] text-blue-700 font-medium flex items-center gap-1">
                              <span>Buyer: {row.buyerName}</span>
                            </div>
                          </div>
                        </td>

                        {/* 4. MB52 Stock Breakdown (Total / Reserved / Available) */}
                        <td className="py-2.5 px-3 text-center align-middle font-mono text-xs">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            <span className="text-slate-500 text-[11px]" title="Total physical MB52 stock">
                              {row.totalPhysicalStock.toLocaleString()}
                            </span>
                            <span className="text-slate-300">/</span>
                            <span
                              className={`text-[11px] ${row.reservedStock > 0 ? 'text-blue-700 font-semibold' : 'text-slate-400'}`}
                              title="Reserved stock by frozen plans"
                            >
                              {row.reservedStock.toLocaleString()}
                            </span>
                            <span className="text-slate-300">/</span>
                            <span
                              className="px-1.5 py-0.5 rounded font-bold bg-slate-100 text-slate-900 border border-slate-200 shadow-2xs"
                              title="Available unreserved stock"
                            >
                              {row.availableStock.toLocaleString()}
                            </span>
                          </div>
                        </td>

                        {/* 5. Gross Requirement */}
                        {scopeMode === 'WEEK' && (
                          <td className="py-2.5 px-3 text-right align-middle font-mono font-bold text-slate-900 text-xs bg-blue-50/30">
                            {row.selectedScopeGrossReq.toLocaleString()}
                          </td>
                        )}

                        {scopeMode === 'MONTH' && (
                          <>
                            {monthWeeks.map((w) => (
                              <td key={w.id} className="py-2.5 px-2 text-right align-middle font-mono text-slate-700 text-xs">
                                {(row.weeklyGrossReq[w.id] || 0).toLocaleString()}
                              </td>
                            ))}
                            <td className="py-2.5 px-3 text-right align-middle font-mono font-bold text-slate-900 text-xs bg-blue-50/30">
                              {row.monthTotalGrossReq.toLocaleString()}
                            </td>
                          </>
                        )}

                        {/* 6. Scheduled Inward Deliveries */}
                        <td className="py-2.5 px-3 align-middle">
                          {row.activeSchedulesForScope.length > 0 ? (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center justify-between gap-1 text-xs">
                                <span className="font-mono font-bold text-emerald-700">
                                  +{row.selectedScopeInward.toLocaleString()} {row.uom}
                                </span>
                                <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded">
                                  {row.activeSchedulesForScope.length} {row.activeSchedulesForScope.length === 1 ? 'batch' : 'batches'}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1 max-w-[220px]">
                                {row.activeSchedulesForScope.map((s) => (
                                  <div
                                    key={s.id}
                                    className="text-[10px] font-mono bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 flex items-center gap-1 group relative"
                                  >
                                    <Calendar className="w-2.5 h-2.5 text-slate-500" />
                                    <span>{s.expectedDeliveryDate.slice(5)}</span>
                                    <strong className="text-slate-800">+{s.promisedQty.toLocaleString()}</strong>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenAddSingleModal(row, s)}
                                      className="text-blue-600 hover:text-blue-800 ml-0.5 cursor-pointer"
                                      title="Edit this schedule batch"
                                    >
                                      <Edit3 className="w-2.5 h-2.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="text-center">
                              <span className="text-[11px] text-slate-400 italic">No inward scheduled</span>
                            </div>
                          )}
                        </td>

                        {/* 7. Net Balance (Deficit / Surplus) */}
                        <td className="py-2.5 px-3 text-center align-middle font-mono text-xs">
                          <span
                            className={`inline-block px-2 py-0.5 rounded font-bold text-xs ${
                              row.hasShortage
                                ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}
                          >
                            {row.selectedScopeBalance > 0
                              ? `+${row.selectedScopeBalance.toLocaleString()}`
                              : row.selectedScopeBalance.toLocaleString()}
                          </span>
                        </td>

                        {/* 8. Quick Actions */}
                        <td className="py-2.5 px-3 text-right align-middle">
                          <div className="flex items-center justify-end gap-1.5">
                            {(() => {
                              const compLogsCount = deliveryScheduleChangeLogs.filter(
                                (l) => l.componentCode === row.componentCode
                              ).length;
                              return (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleOpenHistoryDrawer({
                                      componentCode: row.componentCode,
                                      componentDescription: row.componentDescription,
                                      vendorName: row.vendorName,
                                      title: `Change History: ${row.componentCode}`
                                    })
                                  }
                                  className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                                    compLogsCount > 0
                                      ? 'bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                                      : 'bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200'
                                  }`}
                                  title={`View revision and delivery change history for ${row.componentCode}`}
                                >
                                  <History className="w-3 h-3 text-indigo-600" />
                                  <span>History</span>
                                  {compLogsCount > 0 && (
                                    <span className="px-1 py-0.2 rounded-full bg-indigo-200 text-indigo-900 font-mono text-[9px] font-bold">
                                      {compLogsCount}
                                    </span>
                                  )}
                                </button>
                              );
                            })()}

                            <button
                              type="button"
                              onClick={() => handleOpenAddSingleModal(row)}
                              className="px-2 py-1 rounded text-[11px] font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs cursor-pointer flex items-center gap-1 transition-colors"
                              title="Add delivery schedule for this component"
                            >
                              <Plus className="w-3 h-3" />
                              <span>+ Schedule</span>
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
      )}

      {/* TAB 2: MASTER DELIVERY SCHEDULES LIST & TRACKING */}
      {activeTab === 'schedules_list' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="font-bold text-slate-800">
              Active Vendor Delivery Commitments ({vendorDeliverySchedules.length} total records)
            </div>
            <button
              type="button"
              onClick={() => handleOpenAddSingleModal()}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add New Delivery Commitment</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse divide-y divide-slate-200">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-semibold text-[11px]">
                  <th className="py-2.5 px-3">PO Number</th>
                  <th className="py-2.5 px-3">Component Part No & Description</th>
                  <th className="py-2.5 px-3">Vendor</th>
                  <th className="py-2.5 px-3">Buyer</th>
                  <th className="py-2.5 px-3">Expected Arrival Date</th>
                  <th className="py-2.5 px-3 text-right">Inward Qty</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3">Carrier / Tracking / Notes</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {vendorDeliverySchedules.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-slate-400">
                      No vendor delivery schedules recorded yet. Click "Upload Excel / CSV Schedule" or "+ Add New Commitment".
                    </td>
                  </tr>
                ) : (
                  vendorDeliverySchedules.map((s) => {
                    const matchedBOM = boms.find((b) => b.componentCode === s.componentCode);
                    return (
                      <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                          {s.poNumber || s.id}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-mono font-bold text-slate-900 text-xs">
                            {s.componentCode}
                          </div>
                          <div className="text-[11px] text-slate-500 line-clamp-1">
                            {matchedBOM?.componentDescription || 'Component Material'}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900">{s.vendorName}</div>
                          <div className="text-[10px] font-mono text-slate-400">{s.vendorCode}</div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 font-medium">
                          {s.buyerName}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span>{s.expectedDeliveryDate}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 text-xs">
                          +{s.promisedQty.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                              s.deliveryStatus === 'CONFIRMED_ON_TRACK'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : s.deliveryStatus === 'IN_TRANSIT'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : s.deliveryStatus === 'PARTIAL_PROMISE'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : s.deliveryStatus === 'CANCELLED'
                                ? 'bg-slate-100 text-slate-500 border border-slate-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {s.deliveryStatus.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                          <div>{s.carrierOrTracking || '-'}</div>
                          {s.notes && <div className="text-[10px] text-slate-400 italic truncate max-w-[200px]">{s.notes}</div>}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {(() => {
                              const schedLogsCount = deliveryScheduleChangeLogs.filter(
                                (l) => l.poNumber === s.poNumber || l.scheduleId === s.id
                              ).length;
                              return (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const compRow = consolidatedRows.find((c) => c.componentCode === s.componentCode);
                                    handleOpenHistoryDrawer({
                                      poNumber: s.poNumber,
                                      componentCode: s.componentCode,
                                      componentDescription: compRow?.componentDescription,
                                      vendorName: s.vendorName,
                                      title: `Change History: ${s.poNumber || s.id}`
                                    });
                                  }}
                                  className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                                    schedLogsCount > 0
                                      ? 'bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                                      : 'bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200'
                                  }`}
                                  title={`View timestamped change log for PO ${s.poNumber}`}
                                >
                                  <History className="w-3 h-3 text-indigo-600" />
                                  <span>History</span>
                                  {schedLogsCount > 0 && (
                                    <span className="px-1 py-0.2 rounded-full bg-indigo-200 text-indigo-900 font-mono text-[9px] font-bold">
                                      {schedLogsCount}
                                    </span>
                                  )}
                                </button>
                              );
                            })()}

                            <button
                              type="button"
                              onClick={() => {
                                const compRow = consolidatedRows.find((c) => c.componentCode === s.componentCode);
                                handleOpenAddSingleModal(compRow, s);
                              }}
                              className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 cursor-pointer transition-colors"
                              title="Edit schedule commitment"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSchedule(s.id)}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer transition-colors"
                              title="Delete/cancel schedule"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: EXCEL / CSV BULK SCHEDULE UPLOAD MODAL */}
      {/* ========================================================================= */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-4xl w-full p-6 space-y-4 my-8 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white">
                  <Upload className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Bulk Vendor Delivery Schedule Upload (Excel / CSV)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Upload your filled schedule file or paste spreadsheet rows directly
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsUploadModalOpen(false);
                  setParsedRows([]);
                  setPastedText('');
                }}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* Step 1: File Dropzone & Template Shortcut */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-xl p-4 text-center transition-colors bg-slate-50/50">
                  <FileSpreadsheet className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                  <div className="text-xs font-bold text-slate-800">
                    Select .xlsx, .xls or .csv File
                  </div>
                  <p className="text-[11px] text-slate-500 mb-3">
                    Drag and drop or browse from your computer
                  </p>
                  <label className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs inline-block">
                    Browse File
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv,.txt"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                  {uploadFileName && (
                    <div className="text-xs font-semibold text-emerald-700 mt-2">
                      Loaded: {uploadFileName}
                    </div>
                  )}
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5 mb-1">
                      <Download className="w-3.5 h-3.5 text-blue-600" />
                      Need the Excel Template First?
                    </div>
                    <p className="text-[11px] text-slate-500 mb-2">
                      Download pre-populated template with current RM shortages, fill in the vendor promised quantities, and re-upload here.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadPrefilledTemplate}
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg text-xs font-semibold cursor-pointer shadow-2xs"
                    >
                      📥 Pre-Filled Template
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadBlankTemplate}
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg text-xs font-semibold cursor-pointer shadow-2xs"
                    >
                      📥 Blank Template
                    </button>
                  </div>
                </div>
              </div>

              {/* Paste Clipboard Text Alternative */}
              <div className="border border-slate-200 rounded-xl p-3 bg-white">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-800">
                    Or Paste Spreadsheet Cells (Tab or Comma-Separated Text)
                  </span>
                  {pastedText && (
                    <button
                      type="button"
                      onClick={handleParsePastedText}
                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-semibold cursor-pointer"
                    >
                      Parse Pasted Text
                    </button>
                  )}
                </div>
                <textarea
                  rows={2}
                  placeholder="Paste rows copied directly from Excel (including headers)..."
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  className="w-full text-xs font-mono p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Import Options */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Upload Scope:</label>
                  <select
                    value={uploadScope}
                    onChange={(e) => setUploadScope(e.target.value as any)}
                    className="w-full p-1.5 border border-slate-300 rounded-lg bg-white font-medium"
                  >
                    <option value="SELECTED_WEEK">Selected Week ({activeWeek?.weekLabel})</option>
                    <option value="FULL_MONTH">Full Planning Month ({selectedMonth})</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Import Mode:</label>
                  <select
                    value={importMode}
                    onChange={(e) => setImportMode(e.target.value as any)}
                    className="w-full p-1.5 border border-slate-300 rounded-lg bg-white font-medium"
                  >
                    <option value="APPEND">Merge / Append (Preserve other schedules)</option>
                    <option value="OVERWRITE">Replace Scope (Clean & Overwrite)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Buyer / Planner Name:</label>
                  <input
                    type="text"
                    value={uploadPlannerName}
                    onChange={(e) => setUploadPlannerName(e.target.value)}
                    className="w-full p-1.5 border border-slate-300 rounded-lg bg-white font-medium"
                  />
                </div>
              </div>

              {/* Parsed Rows Preview & Validation Table */}
              {parsedRows.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="p-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">
                      Parsed Preview: {parsedRows.filter((r) => r.isValid).length} of {parsedRows.length} valid rows
                    </span>
                    <span className="font-mono text-emerald-700 font-bold">
                      Total Inward: +{parsedRows.filter((r) => r.isValid).reduce((sum, r) => sum + r.promisedQty, 0).toLocaleString()} units
                    </span>
                  </div>

                  <div className="max-h-56 overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-600 font-semibold text-[11px] sticky top-0 border-b border-slate-200">
                          <th className="py-2 px-2.5">Row</th>
                          <th className="py-2 px-2.5">PO #</th>
                          <th className="py-2 px-2.5">Part No & Description</th>
                          <th className="py-2 px-2.5">Vendor</th>
                          <th className="py-2 px-2.5">Delivery Date</th>
                          <th className="py-2 px-2.5 text-right">Promised Qty</th>
                          <th className="py-2 px-2.5 text-center">Status</th>
                          <th className="py-2 px-2.5">Validation</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsedRows.map((r) => (
                          <tr
                            key={r.rowIndex}
                            className={
                              r.validationStatus === 'ERROR'
                                ? 'bg-rose-50/60'
                                : r.validationStatus === 'WARNING'
                                ? 'bg-amber-50/40'
                                : 'hover:bg-slate-50'
                            }
                          >
                            <td className="py-2 px-2.5 font-mono text-slate-500">{r.rowIndex}</td>
                            <td className="py-2 px-2.5 font-mono font-semibold text-slate-800">{r.poNumber}</td>
                            <td className="py-2 px-2.5">
                              <div className="font-mono font-bold text-slate-900">{r.componentCode}</div>
                              <div className="text-[10px] text-slate-500 truncate max-w-[140px]">{r.componentDescription}</div>
                            </td>
                            <td className="py-2 px-2.5 text-[11px] text-slate-700">{r.vendorName}</td>
                            <td className="py-2 px-2.5 font-mono text-[11px]">{r.expectedDeliveryDate}</td>
                            <td className="py-2 px-2.5 text-right font-mono font-bold text-emerald-700">
                              +{r.promisedQty.toLocaleString()}
                            </td>
                            <td className="py-2 px-2.5 text-center">
                              <span className="text-[10px] font-semibold px-1 py-0.5 rounded bg-slate-100">
                                {r.deliveryStatus}
                              </span>
                            </td>
                            <td className="py-2 px-2.5 text-[10px]">
                              {r.validationStatus === 'VALID' ? (
                                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  OK
                                </span>
                              ) : r.validationStatus === 'WARNING' ? (
                                <span className="text-amber-700 font-semibold flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                                  {r.validationMessage}
                                </span>
                              ) : (
                                <span className="text-rose-700 font-semibold flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3 text-rose-600" />
                                  {r.validationMessage}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-200 pt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setIsUploadModalOpen(false);
                  setParsedRows([]);
                  setPastedText('');
                }}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={parsedRows.filter((r) => r.isValid).length === 0}
                onClick={handleApplyUploadSchedules}
                className={`px-5 py-2 rounded-lg text-xs font-bold shadow-sm flex items-center gap-2 cursor-pointer transition-colors ${
                  parsedRows.filter((r) => r.isValid).length > 0
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  Confirm & Apply Live Schedules ({parsedRows.filter((r) => r.isValid).length} Rows)
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: SINGLE DELIVERY SCHEDULE ADD / EDIT MODAL */}
      {/* ========================================================================= */}
      {isSingleScheduleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm">
                  {singleScheduleForm.id ? 'Edit Vendor Delivery Commitment' : 'Add New Vendor Delivery Commitment'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSingleScheduleModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSingleSchedule} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Component Part No:</label>
                  <select
                    value={singleScheduleForm.componentCode}
                    onChange={(e) => {
                      const code = e.target.value;
                      const matched = consolidatedRows.find((c) => c.componentCode === code);
                      setSingleScheduleForm((prev) => ({
                        ...prev,
                        componentCode: code,
                        componentDescription: matched?.componentDescription || prev.componentDescription,
                        vendorCode: matched?.vendorCode || prev.vendorCode,
                        vendorName: matched?.vendorName || prev.vendorName,
                        buyerName: matched?.buyerName || prev.buyerName
                      }));
                    }}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-white font-mono font-bold"
                  >
                    {consolidatedRows.map((c) => (
                      <option key={c.componentCode} value={c.componentCode}>
                        {c.componentCode} - {c.componentDescription.slice(0, 24)}...
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">PO / Reference #:</label>
                  <input
                    type="text"
                    value={singleScheduleForm.poNumber}
                    onChange={(e) => setSingleScheduleForm({ ...singleScheduleForm, poNumber: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg font-mono font-bold"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Vendor Name:</label>
                  <input
                    type="text"
                    value={singleScheduleForm.vendorName}
                    onChange={(e) => setSingleScheduleForm({ ...singleScheduleForm, vendorName: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Assigned Buyer:</label>
                  <input
                    type="text"
                    value={singleScheduleForm.buyerName}
                    onChange={(e) => setSingleScheduleForm({ ...singleScheduleForm, buyerName: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Expected Delivery Date:</label>
                  <input
                    type="date"
                    value={singleScheduleForm.expectedDeliveryDate}
                    onChange={(e) => setSingleScheduleForm({ ...singleScheduleForm, expectedDeliveryDate: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg font-mono font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Promised Inward Qty:</label>
                  <input
                    type="number"
                    min="1"
                    value={singleScheduleForm.promisedQty}
                    onChange={(e) => setSingleScheduleForm({ ...singleScheduleForm, promisedQty: Number(e.target.value) })}
                    className="w-full p-2 border border-slate-300 rounded-lg font-mono font-bold text-emerald-700"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Delivery Status:</label>
                  <select
                    value={singleScheduleForm.deliveryStatus}
                    onChange={(e) => setSingleScheduleForm({ ...singleScheduleForm, deliveryStatus: e.target.value as any })}
                    className="w-full p-2 border border-slate-300 rounded-lg font-semibold"
                  >
                    <option value="CONFIRMED_ON_TRACK">CONFIRMED ON TRACK</option>
                    <option value="IN_TRANSIT">IN TRANSIT</option>
                    <option value="PARTIAL_PROMISE">PARTIAL PROMISE</option>
                    <option value="DELAYED_AT_RISK">DELAYED AT RISK</option>
                    <option value="CANCELLED">CANCELLED</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Carrier / Tracking:</label>
                  <input
                    type="text"
                    value={singleScheduleForm.carrierOrTracking}
                    onChange={(e) => setSingleScheduleForm({ ...singleScheduleForm, carrierOrTracking: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Mandatory Reason / Notes for Change Log:</label>
                <textarea
                  rows={2}
                  value={singleScheduleForm.reasonForChange}
                  onChange={(e) => setSingleScheduleForm({ ...singleScheduleForm, reasonForChange: e.target.value })}
                  placeholder="Explain reason for this commitment/date adjustment..."
                  className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="border-t border-slate-200 pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsSingleScheduleModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-xs cursor-pointer"
                >
                  {singleScheduleForm.id ? 'Save Commitment Changes' : '+ Add Delivery Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: COMMON PARTS MULTI-FG USAGE BREAKDOWN MODAL */}
      {/* ========================================================================= */}
      {isCommonPartsModalOpen && selectedCommonComp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-xl w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Share2 className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Common Part: {selectedCommonComp.componentCode}
                  </h3>
                  <p className="text-xs text-slate-500">{selectedCommonComp.componentDescription}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCommonPartsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-blue-50/70 p-3 rounded-lg border border-blue-200 text-blue-900 flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  This component is a <strong>Common / Shared Part</strong> required by{' '}
                  <strong>{selectedCommonComp.sharedInFGsCount} Finished Goods</strong>. Total demand is consolidated across all lines.
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-semibold">
                      <th className="py-2 px-3">Finished Good (FG)</th>
                      <th className="py-2 px-3 text-center">BOM Usage / FG</th>
                      <th className="py-2 px-3 text-right">FG Monthly Plan</th>
                      <th className="py-2 px-3 text-right">Component Demand</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedCommonComp.usedInFGs.map((fg) => {
                      const fgPlan = monthlyPlans.find((p) => p.fgCode === fg.fgCode && p.month === selectedMonth);
                      const monthlyTarget = fgPlan ? fgPlan.monthlyTarget : 0;
                      const compDemand = monthlyTarget * fg.usagePerFG;
                      return (
                        <tr key={fg.fgCode} className="hover:bg-slate-50">
                          <td className="py-2 px-3">
                            <div className="font-mono font-bold text-slate-900">{fg.fgCode}</div>
                            <div className="text-[10px] text-slate-500">{fg.fgDescription}</div>
                          </td>
                          <td className="py-2 px-3 text-center font-mono font-semibold">
                            {fg.usagePerFG} {selectedCommonComp.uom}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-slate-700">
                            {monthlyTarget.toLocaleString()} units
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-blue-700">
                            {compDemand.toLocaleString()} {selectedCommonComp.uom}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setIsCommonPartsModalOpen(false)}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 4. INLINE DRAWER: Timestamped Data Point & Vendor Delivery Schedule Change History */}
      <HistoryDrawer
        isOpen={isHistoryDrawerOpen}
        onClose={() => {
          setIsHistoryDrawerOpen(false);
          setHistoryDrawerFilter(null);
        }}
        filter={historyDrawerFilter}
        onClearFilter={() => setHistoryDrawerFilter(null)}
        deliveryScheduleChangeLogs={deliveryScheduleChangeLogs}
      />
    </div>
  );
};
