import {
  BOMItem,
  VendorBuyerItem,
  WeekDefinition,
  MonthlyPlanItem,
  MB51TransactionItem,
  StockReportItem,
  VendorDeliverySchedule,
  FGPlanFreezeItem,
  ManagementCriticalLossItem,
  ImpactedFGProgram
} from '../types';
import { isDateInWeek } from './weeklyMrpEngine';

// Standard Unit Prices (INR) for OEM Finished Goods
export const FG_UNIT_PRICES_INR: Record<string, number> = {
  '7.06496.03.0': 5800, // Vacuum Pump Panther 2.0L (Tata Motors)
  '7.09629.01.0': 4900, // FAM B Tandem Vacuum Pump (Mahindra & Mahindra)
  '7.02551.11.0': 4200, // Variable Flow Oil Pump Gen 3 (Hyundai)
  '7001001': 5500,
  '7001002': 4600
};

export const DEFAULT_FG_UNIT_PRICE_INR = 5000;

export interface ManagementLossSummary {
  selectedWeek: WeekDefinition;
  monthWeeks: WeekDefinition[];
  criticalItems: ManagementCriticalLossItem[];
  allTrackedComponentsCount: number;
  totalProductionLossFGUnits: number;
  totalFinancialLossINR: number;
  totalShiftsAtRisk: number;
  impactedOEMCustomers: string[];
  impactedAssemblyLines: string[];
  totalRecoverableUnitsWithAction: number;
  totalRecoverableValueINR: number;
}

/**
 * End-to-End Management Production Loss Calculation Engine
 * Analyzes all raw materials, evaluates free stock, scheduled vendor receipts,
 * and pinpoints components causing assembly line starvation and finished goods production loss.
 */
export function computeManagementProductionLossReport(
  selectedMonth: string,
  selectedWeekId: string | undefined,
  monthlyPlans: MonthlyPlanItem[],
  weeks: WeekDefinition[],
  boms: BOMItem[],
  vendorBuyers: VendorBuyerItem[],
  mb51List: MB51TransactionItem[],
  stockList: StockReportItem[],
  vendorDeliverySchedules: VendorDeliverySchedule[],
  planFreezeList: FGPlanFreezeItem[] = [],
  savedDecisions: Record<
    string,
    {
      decisionStatus: ManagementCriticalLossItem['decisionStatus'];
      managementNotes?: string;
      actionOwner?: string;
      targetResolutionDate?: string;
    }
  > = {}
): ManagementLossSummary {
  // 1. Calendar weeks for selected month
  const monthWeeks = weeks
    .filter((w) => w.month === selectedMonth)
    .sort((a, b) => a.weekNo - b.weekNo);

  let selectedWeek = monthWeeks.find((w) => w.id === selectedWeekId);
  if (!selectedWeek) {
    selectedWeek =
      monthWeeks.find((w) => w.weekNo === 2) ||
      monthWeeks[0] || {
        id: 'w-default',
        month: selectedMonth,
        weekNo: 2,
        weekLabel: 'Week 2 (08-14 Aug)',
        startDate: `${selectedMonth}-08`,
        endDate: `${selectedMonth}-14`,
        daysCount: 7,
        workingDays: 6
      };
  }

  // 2. Identify prior weeks in month
  const priorWeeks = monthWeeks.filter((w) => w.weekNo < selectedWeek.weekNo);
  const monthPlans = monthlyPlans.filter((p) => p.month === selectedMonth);

  // 3. Precompute Gross Targets for each FG (Plan + Prior Backlog)
  const fgGrossTargetMap = new Map<
    string,
    { planTarget: number; priorBacklog: number; grossTarget: number }
  >();

  monthPlans.forEach((plan) => {
    const priorBacklog = priorWeeks.reduce((sum, pw) => {
      const pTarget = plan.weeklyBreakdown[pw.id] || 0;
      const actualProd = mb51List
        .filter((tx) => {
          const isMvt101 = tx.movementType === '101';
          const isThisFG = tx.partNumber === plan.fgCode;
          const matchesWeek = tx.weekId === pw.id || isDateInWeek(tx.postingDate, pw);
          return isMvt101 && isThisFG && matchesWeek;
        })
        .reduce((s, tx) => s + tx.quantity, 0);
      return sum + Math.max(0, pTarget - actualProd);
    }, 0);

    const currentPlanTarget = plan.weeklyBreakdown[selectedWeek.id] || 0;
    const grossTarget = currentPlanTarget + priorBacklog;
    fgGrossTargetMap.set(plan.fgCode, { planTarget: currentPlanTarget, priorBacklog, grossTarget });
  });

  // 4. Precompute Stock Reservations for FROZEN FGs
  const componentReservationMap = new Map<
    string,
    { fgCode: string; fgDescription: string; reservedQty: number }[]
  >();

  monthPlans.forEach((plan) => {
    const freezeRec = planFreezeList.find(
      (f) => f.fgCode === plan.fgCode && (f.weekId === selectedWeek.id || f.month === selectedMonth)
    );
    if (freezeRec?.status === 'FROZEN') {
      const grossInfo = fgGrossTargetMap.get(plan.fgCode);
      const grossTarget = grossInfo ? grossInfo.grossTarget : 0;
      const fgBOMs = boms.filter((b) => b.fgCode === plan.fgCode);

      fgBOMs.forEach((bom) => {
        const requiredQty = Math.round(grossTarget * bom.qty);
        const existing = componentReservationMap.get(bom.componentCode) || [];
        existing.push({
          fgCode: plan.fgCode,
          fgDescription: plan.fgDescription,
          reservedQty: requiredQty
        });
        componentReservationMap.set(bom.componentCode, existing);
      });
    }
  });

  // 5. Gather all unique components referenced in active BOMs
  const uniqueComponentCodes = Array.from(new Set(boms.map((b) => b.componentCode)));
  const criticalItems: ManagementCriticalLossItem[] = [];

  uniqueComponentCodes.forEach((compCode) => {
    const relevantBoms = boms.filter((b) => b.componentCode === compCode);
    if (relevantBoms.length === 0) return;

    const firstBom = relevantBoms[0];
    const category = firstBom.category || 'RM';
    const uom = firstBom.uom || 'PC';

    // Stock Data (MB52)
    const stockItem = stockList.find((s) => s.partNumber === compCode);
    const currentPhysicalStock = stockItem ? stockItem.unrestrictedStock : 0;
    const safetyStock = stockItem ? stockItem.safetyStock : 500;
    const storageLocation = stockItem?.storageLocation || 'RM01 (Central RM Stores)';

    // Reservations
    const allReservations = componentReservationMap.get(compCode) || [];
    const totalReservedStock = allReservations.reduce((sum, r) => sum + r.reservedQty, 0);
    const availableFreeStock = Math.max(0, currentPhysicalStock - totalReservedStock);

    // Scheduled Inward Deliveries for selectedWeek
    const compSchedules = vendorDeliverySchedules.filter((s) => {
      const matchesComp = s.componentCode === compCode;
      const matchesWeek =
        s.weekId === selectedWeek.id ||
        (selectedWeek.startDate &&
          selectedWeek.endDate &&
          s.expectedDeliveryDate >= selectedWeek.startDate &&
          s.expectedDeliveryDate <= selectedWeek.endDate);
      return matchesComp && matchesWeek;
    });

    const scheduledDeliveriesQty = compSchedules.reduce((sum, s) => sum + s.promisedQty, 0);
    const totalAvailableSupply = availableFreeStock + scheduledDeliveriesQty;

    // Vendor & Buyer Lookup
    const vb = vendorBuyers.find((v) => v.suppliedComponents.includes(compCode));
    const vendorCode = vb?.vendorCode || 'V-1001';
    const vendorName = vb?.vendorName || 'Endurance Technologies Ltd';
    const vendorCity = vb?.city || 'Chakan, Pune';
    const buyerName = vb?.buyerName || 'Rajesh Kumar (Buyer - Castings)';
    const buyerEmail = vb?.buyerEmail || 'rajesh.k@autoparts.com';
    const buyerPhone = vb?.buyerPhone || '+91 98220 11223';
    const leadTimeDays = vb?.leadTimeDays || 7;

    // Evaluate Impact across all consuming FGs
    const impactedFGs: ImpactedFGProgram[] = [];
    let totalGrossRequiredQty = 0;
    let worstStoppageDay = 'No Stoppage (Sufficient)';
    let earliestStoppageDayIndex = 999;
    let totalShiftsAtRisk = 0;

    relevantBoms.forEach((bom) => {
      const plan = monthPlans.find((p) => p.fgCode === bom.fgCode);
      if (!plan) return;

      const grossInfo = fgGrossTargetMap.get(plan.fgCode);
      const weekGrossTarget = grossInfo ? grossInfo.grossTarget : 0;
      if (weekGrossTarget <= 0) return;

      const reqForThisFG = Math.round(weekGrossTarget * bom.qty);
      totalGrossRequiredQty += reqForThisFG;

      // Buildable calculations
      const maxBuildableWithStock = bom.qty > 0 ? Math.floor(availableFreeStock / bom.qty) : weekGrossTarget;
      const maxBuildableWithDeliveries = bom.qty > 0 ? Math.floor(totalAvailableSupply / bom.qty) : weekGrossTarget;

      const productionLossUnits = Math.max(0, weekGrossTarget - maxBuildableWithDeliveries);
      const unitPriceINR = FG_UNIT_PRICES_INR[plan.fgCode] || DEFAULT_FG_UNIT_PRICE_INR;
      const financialLossINR = productionLossUnits * unitPriceINR;

      // Stoppage Day Simulation
      const workingDays = selectedWeek.workingDays || 6;
      const dailyReq = reqForThisFG / workingDays;
      let stoppageDayEstimate = 'Safe Run';
      let stoppageHoursAtRisk = 0;

      if (productionLossUnits > 0 || maxBuildableWithStock < weekGrossTarget) {
        const daysCoveredByStock = dailyReq > 0 ? Math.min(workingDays, Math.floor(availableFreeStock / dailyReq)) : workingDays;
        const stoppageDayNumber = Math.max(1, Math.min(workingDays, daysCoveredByStock + 1));
        
        const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayName = dayNames[stoppageDayNumber - 1] || 'Mid-Week';
        const shift = daysCoveredByStock % 1 > 0.5 ? 'Shift 2 (Afternoon)' : 'Shift 1 (Morning)';
        stoppageDayEstimate = `Day ${stoppageDayNumber} (${dayName}) - ${shift}`;

        if (stoppageDayNumber < earliestStoppageDayIndex) {
          earliestStoppageDayIndex = stoppageDayNumber;
          worstStoppageDay = stoppageDayEstimate;
        }

        // Shifts at risk
        const lostShifts = Math.max(1, Math.round((workingDays - daysCoveredByStock) * 2));
        stoppageHoursAtRisk = lostShifts * 8;
        totalShiftsAtRisk += lostShifts;
      }

      impactedFGs.push({
        fgCode: plan.fgCode,
        fgDescription: plan.fgDescription,
        customerName: plan.customerName || 'OEM Automotive Client',
        line: bom.line || 'Line-1',
        miniFactory: bom.miniFactory || 'Pumps_Division',
        bomUsageQty: bom.qty,
        uom,
        unitPriceINR,
        weekGrossTarget,
        maxBuildableWithStock,
        maxBuildableWithDeliveries,
        productionLossUnits,
        financialLossINR,
        stoppageDayEstimate,
        stoppageHoursAtRisk,
        stockoutDeficitForThisFG: Math.max(0, reqForThisFG - totalAvailableSupply)
      });
    });

    if (totalGrossRequiredQty === 0) return;

    const netDeficitQty = Math.max(0, totalGrossRequiredQty - totalAvailableSupply);
    const totalProductionLossFGUnits = impactedFGs.reduce((sum, fg) => sum + fg.productionLossUnits, 0);
    const totalFinancialLossINR = impactedFGs.reduce((sum, fg) => sum + fg.financialLossINR, 0);

    // Is this item critical for management review?
    // An item is critical if there is a net deficit, or if production loss > 0, or if stock is critically short without PO
    const isCritical = netDeficitQty > 0 || totalProductionLossFGUnits > 0 || (availableFreeStock < totalGrossRequiredQty && compSchedules.length === 0);

    if (!isCritical) return;

    // Delivery Status Rating
    let deliveryStatusRating: ManagementCriticalLossItem['deliveryStatusRating'] = 'CONFIRMED_ON_TRACK';
    if (compSchedules.length === 0) {
      deliveryStatusRating = 'NO_PO_ISSUED';
    } else if (scheduledDeliveriesQty < netDeficitQty) {
      deliveryStatusRating = 'INSUFFICIENT_PROMISE';
    } else if (compSchedules.some((s) => s.deliveryStatus === 'DELAYED_AT_RISK')) {
      deliveryStatusRating = 'DELAYED_AT_RISK';
    }

    // Criticality Level
    let criticalityLevel: ManagementCriticalLossItem['criticalityLevel'] = 'MODERATE_RISK';
    if (totalProductionLossFGUnits > 500 || deliveryStatusRating === 'NO_PO_ISSUED' || earliestStoppageDayIndex <= 2) {
      criticalityLevel = 'SEVEREST_IMMEDIATE_STOPPAGE';
    } else if (totalProductionLossFGUnits > 0) {
      criticalityLevel = 'HIGH_PRODUCTION_LOSS';
    }

    // Category Subtype & Diagnostics
    let categorySubtype = 'Precision Machined';
    let rootCauseCategory: ManagementCriticalLossItem['rootCauseCategory'] = 'VENDOR_TOOLING_BREAKDOWN';
    let rootCauseDescription = `Supplier production constraint at ${vendorName}; delivery promised (${scheduledDeliveriesQty.toLocaleString()} ${uom}) cannot fulfill weekly requirement of ${totalGrossRequiredQty.toLocaleString()} ${uom}.`;

    if (compCode === '100201') {
      categorySubtype = 'Die-Cast Aluminum Housing';
      rootCauseCategory = 'VENDOR_TOOLING_BREAKDOWN';
      rootCauseDescription = 'Die-casting tooling core pin fatigue breakdown at Endurance Chakan foundry. Replacement tooling insert under CNC EDM finishing; vendor running at 45% standard cycle time.';
    } else if (compCode === '200405') {
      categorySubtype = 'Composite Carbon Sliding Vanes';
      rootCauseCategory = 'CUSTOMS_IMPORT_HOLD';
      rootCauseDescription = 'Imported raw fluorosilicone carbon blend consignment detained under special customs inspection at Nhava Sheva container port pending lab compliance clearance.';
    } else if (compCode === '100402') {
      categorySubtype = 'Sintered Powder Metal Gerotors';
      rootCauseCategory = 'QUALITY_REJECTION_BATCH';
      rootCauseDescription = 'Sintering continuous furnace heating zone drift caused 34% micro-hardness rejection on heat-treated batch at GKN Pune. Re-compaction of powder batch required.';
    } else if (compCode === '300105') {
      categorySubtype = 'High-Tensile Fasteners (Grade 10.9)';
      rootCauseCategory = 'VENDOR_TOOLING_BREAKDOWN';
      rootCauseDescription = 'Cold-forging header die crack on M6 bolt line at Sundram Fasteners. Plating batch pending de-embrittlement bake cycle.';
    } else if (compCode === '200408' || compCode === '200409') {
      categorySubtype = 'Precision Elastomeric Seals & O-Rings';
      rootCauseCategory = 'RAW_MATERIAL_SUPPLY_DELAY';
      rootCauseDescription = 'HNBR raw rubber compound vulcanization cycle bottleneck at Freudenberg Mohali; air shipment delayed due to carrier capacity.';
    } else if (compCode.startsWith('800')) {
      categorySubtype = 'Anti-Corrosion / Export Packaging';
      rootCauseCategory = 'PURCHASING_PO_DELAY';
      rootCauseDescription = 'Purchase Order release hold pending monthly vendor price negotiation sign-off; supplier holding dispatch until PO line release.';
    }

    // Recommended Executive Interventions
    const expediteCost = Math.round(Math.min(75000, Math.max(25000, netDeficitQty * 18)));
    const potentialRecoveredUnits = Math.min(totalProductionLossFGUnits, Math.round(netDeficitQty / (firstBom.qty || 1)));
    const savedValue = potentialRecoveredUnits * (FG_UNIT_PRICES_INR[relevantBoms[0].fgCode] || DEFAULT_FG_UNIT_PRICE_INR);

    const recommendedActions: ManagementCriticalLossItem['recommendedActions'] = [
      {
        actionType: 'EXPEDITE_AIR_FREIGHT',
        title: 'Authorize Emergency Dedicated Hot-Shot / Air Freight',
        description: `Direct vendor plant dispatch via dedicated express logistics directly to Plant Dock 4 within 36-48 hours. Prevents assembly line stoppage and recovers ~${potentialRecoveredUnits.toLocaleString()} FG units.`,
        costINR: expediteCost,
        potentialUnitsRecovered: potentialRecoveredUnits,
        financialValueSavedINR: savedValue,
        feasibility: 'HIGH'
      },
      {
        actionType: 'ACTIVATE_SECOND_SOURCE',
        title: 'Emergency Off-Tool Second Source Release',
        description: `Trigger qualified second supplier (e.g. Rico Auto / Sanjeev Auto) for off-tool 1,000 unit batch with fast-track receiving inspection waiver.`,
        costINR: Math.round(expediteCost * 1.4),
        potentialUnitsRecovered: Math.round(potentialRecoveredUnits * 0.85),
        financialValueSavedINR: Math.round(savedValue * 0.85),
        feasibility: 'MEDIUM'
      },
      {
        actionType: 'DIVERT_STOCK_FROM_OTHER_LINE',
        title: 'Divert Common Safety Stock / Line Balancing',
        description: `Reallocate available buffer stock from non-critical customer program to protect high-penalty OEM line (Tata Motors / M&M).`,
        costINR: 0,
        potentialUnitsRecovered: Math.round(potentialRecoveredUnits * 0.5),
        financialValueSavedINR: Math.round(savedValue * 0.5),
        feasibility: 'HIGH'
      },
      {
        actionType: 'RESCHEDULE_LINE_VARIANTS',
        title: 'Reschedule Assembly Line to Non-Constrained Variant',
        description: `Swap Shift 2 and 3 production schedules to alternative FG variants that do not consume this component, preserving overall plant output.`,
        costINR: 15000,
        potentialUnitsRecovered: Math.round(potentialRecoveredUnits * 0.7),
        financialValueSavedINR: Math.round(savedValue * 0.7),
        feasibility: 'REQUIRES_EXECUTIVE_APPROVAL'
      }
    ];

    // Saved Decision or default
    const saved = savedDecisions[compCode];
    const decisionStatus = saved?.decisionStatus || 'PENDING_EXECUTIVE_DECISION';
    const managementNotes = saved?.managementNotes || (decisionStatus === 'PENDING_EXECUTIVE_DECISION' ? 'Awaiting Plant Head & Supply Chain Director intervention.' : '');
    const actionOwner = saved?.actionOwner || buyerName;
    const targetResolutionDate = saved?.targetResolutionDate || (selectedWeek.startDate || '2026-08-10');

    // Working days coverage
    const dailyBurnRate = totalGrossRequiredQty / (selectedWeek.workingDays || 6);
    const coverageDays = dailyBurnRate > 0 ? Math.round((totalAvailableSupply / dailyBurnRate) * 10) / 10 : 0;

    criticalItems.push({
      id: `crit-${compCode}`,
      componentCode: compCode,
      componentDescription: firstBom.componentDescription,
      category,
      categorySubtype,
      uom,
      storageLocation,
      currentPhysicalStock,
      reservedStock: totalReservedStock,
      availableFreeStock,
      scheduledDeliveriesQty,
      totalAvailableSupply,
      totalGrossRequiredQty,
      netDeficitQty,
      safetyStock,
      coverageDays,
      vendorCode,
      vendorName,
      vendorCity,
      buyerName,
      buyerEmail,
      buyerPhone,
      leadTimeDays,
      activeDeliverySchedules: compSchedules.map((s) => ({
        id: s.id,
        poNumber: s.poNumber || `PO-${s.vendorCode}-${s.componentCode}`,
        expectedDeliveryDate: s.expectedDeliveryDate,
        promisedQty: s.promisedQty,
        deliveryStatus: s.deliveryStatus,
        carrierOrTracking: s.carrierOrTracking
      })),
      deliveryStatusRating,
      impactedFGs,
      totalProductionLossFGUnits,
      totalFinancialLossINR,
      worstStoppageDay,
      totalShiftsAtRisk,
      criticalityLevel,
      rootCauseCategory,
      rootCauseDescription,
      recommendedActions,
      decisionStatus,
      managementNotes,
      actionOwner,
      targetResolutionDate
    });
  });

  // Sort critical items by financial loss exposure and production loss
  criticalItems.sort((a, b) => b.totalFinancialLossINR - a.totalFinancialLossINR || b.totalProductionLossFGUnits - a.totalProductionLossFGUnits);

  // Aggregates
  const totalProductionLossFGUnits = criticalItems.reduce((sum, c) => sum + c.totalProductionLossFGUnits, 0);
  const totalFinancialLossINR = criticalItems.reduce((sum, c) => sum + c.totalFinancialLossINR, 0);
  const totalShiftsAtRisk = criticalItems.reduce((sum, c) => sum + c.totalShiftsAtRisk, 0);

  const customerSet = new Set<string>();
  const lineSet = new Set<string>();

  criticalItems.forEach((c) => {
    c.impactedFGs.forEach((fg) => {
      customerSet.add(fg.customerName);
      lineSet.add(fg.line);
    });
  });

  const totalRecoverableUnitsWithAction = criticalItems.reduce((sum, c) => {
    const bestAction = c.recommendedActions[0];
    return sum + (bestAction ? bestAction.potentialUnitsRecovered : 0);
  }, 0);

  const totalRecoverableValueINR = criticalItems.reduce((sum, c) => {
    const bestAction = c.recommendedActions[0];
    return sum + (bestAction ? bestAction.financialValueSavedINR : 0);
  }, 0);

  return {
    selectedWeek,
    monthWeeks,
    criticalItems,
    allTrackedComponentsCount: uniqueComponentCodes.length,
    totalProductionLossFGUnits,
    totalFinancialLossINR,
    totalShiftsAtRisk,
    impactedOEMCustomers: Array.from(customerSet),
    impactedAssemblyLines: Array.from(lineSet),
    totalRecoverableUnitsWithAction,
    totalRecoverableValueINR
  };
}
