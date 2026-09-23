import {
  BOMItem,
  VendorBuyerItem,
  WeekDefinition,
  MonthlyPlanItem,
  MB51TransactionItem,
  StockReportItem,
  FGWeeklyCoverageSummary,
  RMWeeklyRequirementSummary
} from '../types';

/**
 * Helper to check if a date falls within a week definition range
 */
export function isDateInWeek(dateStr: string, week: WeekDefinition): boolean {
  if (!dateStr || !week.startDate || !week.endDate) return false;
  return dateStr >= week.startDate && dateStr <= week.endDate;
}

/**
 * Helper to match an MB51 transaction to a week definition
 */
export function getWeekForTransaction(
  tx: MB51TransactionItem,
  weeks: WeekDefinition[]
): WeekDefinition | undefined {
  if (tx.weekId) {
    const found = weeks.find((w) => w.id === tx.weekId);
    if (found) return found;
  }
  return weeks.find((w) => isDateInWeek(tx.postingDate, w));
}

/**
 * Computes FG Weekly Plan vs Actual Receipts (MB51 101 prefix 7) vs Dispatches (MB51 601)
 */
export function computeFGWeeklyCoverage(
  selectedMonth: string,
  monthlyPlans: MonthlyPlanItem[],
  weeks: WeekDefinition[],
  mb51List: MB51TransactionItem[],
  stockList: StockReportItem[]
): FGWeeklyCoverageSummary[] {
  const monthWeeks = weeks
    .filter((w) => w.month === selectedMonth)
    .sort((a, b) => a.weekNo - b.weekNo);

  const monthPlans = monthlyPlans.filter((p) => p.month === selectedMonth);

  return monthPlans.map((plan) => {
    // Find starting FG stock
    const stockItem = stockList.find((s) => s.partNumber === plan.fgCode);
    const startingStock = stockItem ? stockItem.unrestrictedStock : 0;

    let rollingStock = startingStock;
    let totalActualProd = 0;
    let totalActualDisp = 0;
    let totalPlanTarget = 0;

    const weekSummaries = monthWeeks.map((week) => {
      const planTarget = plan.weeklyBreakdown[week.id] || 0;
      totalPlanTarget += planTarget;

      // Filter MB51 transactions for this FG and this week
      const fgReceipts = mb51List.filter((tx) => {
        const isMvt101 = tx.movementType === '101';
        const isThisFG = tx.partNumber === plan.fgCode;
        const matchesWeek =
          tx.weekId === week.id || isDateInWeek(tx.postingDate, week);
        return isMvt101 && isThisFG && matchesWeek;
      });

      const actualProd = fgReceipts.reduce((sum, tx) => sum + tx.quantity, 0);
      totalActualProd += actualProd;

      const fgDispatches = mb51List.filter((tx) => {
        const isMvt601 = tx.movementType === '601';
        const isThisFG = tx.partNumber === plan.fgCode;
        const matchesWeek =
          tx.weekId === week.id || isDateInWeek(tx.postingDate, week);
        return isMvt601 && isThisFG && matchesWeek;
      });

      const actualDisp = fgDispatches.reduce((sum, tx) => sum + tx.quantity, 0);
      totalActualDisp += actualDisp;

      const variance = actualProd - planTarget;
      rollingStock = rollingStock + actualProd - actualDisp;

      return {
        weekId: week.id,
        weekNo: week.weekNo,
        weekLabel: week.weekLabel,
        daysCount: week.daysCount,
        planTarget,
        actualProductionReceipt: actualProd,
        variance,
        actualDispatch: actualDisp,
        closingStock: rollingStock
      };
    });

    const achievementRate =
      totalPlanTarget > 0 ? (totalActualProd / totalPlanTarget) * 100 : 0;

    return {
      fgCode: plan.fgCode,
      fgDescription: plan.fgDescription,
      customerName: plan.customerName,
      startingStock,
      monthlyPlanTarget: plan.monthlyTarget,
      weeks: weekSummaries,
      totalActualProduction: totalActualProd,
      totalActualDispatch: totalActualDisp,
      overallAchievementRate: Math.round(achievementRate * 10) / 10
    };
  });
}

/**
 * Computes Consolidated RM/PM Requirements, MB51 Inwards (101 prefix non-7), Stock Balances & Buyer Assignments
 */
export function computeRMWeeklyRequirements(
  selectedMonth: string,
  monthlyPlans: MonthlyPlanItem[],
  weeks: WeekDefinition[],
  boms: BOMItem[],
  vendorBuyers: VendorBuyerItem[],
  mb51List: MB51TransactionItem[],
  stockList: StockReportItem[]
): RMWeeklyRequirementSummary[] {
  const monthWeeks = weeks
    .filter((w) => w.month === selectedMonth)
    .sort((a, b) => a.weekNo - b.weekNo);

  const monthPlans = monthlyPlans.filter((p) => p.month === selectedMonth);

  // 1. Group BOM items by componentCode
  const componentMap = new Map<
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
    const existing = componentMap.get(bom.componentCode);
    if (existing) {
      if (!existing.usedInFGs.some((f) => f.fgCode === bom.fgCode)) {
        existing.usedInFGs.push({
          fgCode: bom.fgCode,
          fgDescription: bom.fgDescription,
          usagePerFG: bom.qty
        });
      }
    } else {
      componentMap.set(bom.componentCode, {
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

  const summaries: RMWeeklyRequirementSummary[] = [];

  componentMap.forEach((comp) => {
    // Lookup vendor and buyer from master
    const vbMapping = vendorBuyers.find((vb) =>
      vb.suppliedComponents.includes(comp.componentCode)
    );

    const buyerName = vbMapping
      ? vbMapping.buyerName
      : 'Unassigned Buyer';
    const vendorName = vbMapping ? vbMapping.vendorName : 'Direct / Spot Vendor';
    const vendorCode = vbMapping ? vbMapping.vendorCode : 'V-NONE';
    const leadTimeDays = vbMapping ? vbMapping.leadTimeDays : 7;

    // Lookup Stock Report
    const stockItem = stockList.find((s) => s.partNumber === comp.componentCode);
    const currentStock = stockItem ? stockItem.unrestrictedStock : 0;
    const safetyStock = stockItem ? stockItem.safetyStock : 500;

    let rollingStock = currentStock;
    let totalGrossReq = 0;
    let totalInward = 0;
    let overallStatus: 'OK' | 'WARNING' | 'SHORTAGE' = 'OK';
    let maxShortage = 0;

    const weekSummaries = monthWeeks.map((week) => {
      // Calculate Gross Requirement across all active FG plans in this month
      let grossReqForWeek = 0;
      comp.usedInFGs.forEach((fgUsage) => {
        const fgPlan = monthPlans.find((p) => p.fgCode === fgUsage.fgCode);
        if (fgPlan) {
          const fgWeekQty = fgPlan.weeklyBreakdown[week.id] || 0;
          grossReqForWeek += fgWeekQty * fgUsage.usagePerFG;
        }
      });

      grossReqForWeek = Math.round(grossReqForWeek * 100) / 100;
      totalGrossReq += grossReqForWeek;

      // Filter MB51 Receipts (Mvt 101 prefix non-7) for this component
      const rmReceipts = mb51List.filter((tx) => {
        const isMvt101 = tx.movementType === '101';
        const isThisComp = tx.partNumber === comp.componentCode;
        const matchesWeek =
          tx.weekId === week.id || isDateInWeek(tx.postingDate, week);
        return isMvt101 && isThisComp && matchesWeek;
      });

      const inwardQty = rmReceipts.reduce((sum, tx) => sum + tx.quantity, 0);
      totalInward += inwardQty;

      // Projected Stock = Rolling Stock + Inward - Gross Requirement
      rollingStock = rollingStock + inwardQty - grossReqForWeek;

      let status: 'OK' | 'WARNING' | 'SHORTAGE' = 'OK';
      let deficit = 0;

      if (rollingStock < 0) {
        status = 'SHORTAGE';
        deficit = Math.abs(rollingStock);
        if (deficit > maxShortage) maxShortage = deficit;
        overallStatus = 'SHORTAGE';
      } else if (rollingStock < safetyStock) {
        status = 'WARNING';
        deficit = safetyStock - rollingStock;
        if (overallStatus !== 'SHORTAGE') {
          overallStatus = 'WARNING';
        }
      }

      return {
        weekId: week.id,
        weekNo: week.weekNo,
        weekLabel: week.weekLabel,
        grossRequirement: grossReqForWeek,
        actualInwardReceipt: inwardQty,
        projectedStock: Math.round(rollingStock),
        deficit: Math.round(deficit),
        status
      };
    });

    summaries.push({
      componentCode: comp.componentCode,
      componentDescription: comp.componentDescription,
      category: comp.category,
      uom: comp.uom,
      buyerName,
      vendorName,
      vendorCode,
      leadTimeDays,
      currentStock,
      safetyStock,
      usedInFGs: comp.usedInFGs,
      weeks: weekSummaries,
      totalGrossRequirement: Math.round(totalGrossReq),
      totalInwardReceived: Math.round(totalInward),
      overallStatus,
      maxShortageQty: Math.round(maxShortage)
    });
  });

  // Sort by status: SHORTAGE first, then WARNING, then OK
  return summaries.sort((a, b) => {
    const score = (s: string) =>
      s === 'SHORTAGE' ? 3 : s === 'WARNING' ? 2 : 1;
    return score(b.overallStatus) - score(a.overallStatus);
  });
}
