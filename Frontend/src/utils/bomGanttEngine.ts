import {
  ExplodedBOMComponentSummary,
  WeekDefinition,
  VendorDeliverySchedule,
  BOMGanttDaySimulation,
  BOMGanttTimelineResult,
  BOMGanttDayDelivery
} from '../types';

/**
 * Generates an array of ISO dates (YYYY-MM-DD) between start and end date (inclusive)
 */
export function getDatesInRange(startDateStr: string, endDateStr: string): string[] {
  const dates: string[] = [];
  try {
    const curr = new Date(startDateStr);
    const end = new Date(endDateStr);
    
    // Safety guard against infinite loops
    let count = 0;
    while (curr <= end && count < 60) {
      dates.push(curr.toISOString().slice(0, 10));
      curr.setDate(curr.getDate() + 1);
      count++;
    }
  } catch (e) {
    console.error('Failed to generate date range:', e);
  }
  return dates;
}

/**
 * Formats YYYY-MM-DD into short display like "08 Sep" or "Tue 08 Sep"
 */
export function formatGanttDate(dateStr: string): { label: string; weekday: string; full: string } {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const dayName = weekdays[d.getDay()] || '';
    const monthName = months[d.getMonth()] || '';
    const dayNum = String(d.getDate()).padStart(2, '0');

    return {
      label: `${dayNum} ${monthName}`,
      weekday: dayName,
      full: `${dayName}, ${dayNum} ${monthName}`
    };
  } catch {
    return {
      label: dateStr.slice(5),
      weekday: '',
      full: dateStr
    };
  }
}

/**
 * Core Gantt Simulation Engine:
 * Simulates day-by-day inventory consumption vs expected vendor arrival dates.
 * Determines if expected delivery dates will meet the per-day production requirement.
 * If not, marks critical days with RED (Line Starvation/Stoppage).
 */
export function simulateBOMComponentDailyTimeline(
  comp: ExplodedBOMComponentSummary,
  fgCode: string,
  fgDescription: string,
  fgTotalGrossTarget: number,
  week: WeekDefinition,
  activeDeliverySchedules: VendorDeliverySchedule[],
  options?: {
    customInitialStock?: number;
    simulatedDeliveries?: VendorDeliverySchedule[];
    horizonDays?: number; // e.g. 7 or 14
    nonWorkingDays?: string[]; // e.g. ['Sun']
  }
): BOMGanttTimelineResult {
  const initialStock = options?.customInitialStock !== undefined
    ? options.customInitialStock
    : comp.currentStock; // Unreserved available stock

  const safetyStock = comp.safetyStock || 0;
  const bomQty = comp.bomQty || 1;

  // Determine date range for simulation
  let startDate = week.startDate || '2026-09-08';
  let endDate = week.endDate || '2026-09-14';

  if (options?.horizonDays && options.horizonDays > week.daysCount) {
    const s = new Date(startDate);
    s.setDate(s.getDate() + options.horizonDays - 1);
    endDate = s.toISOString().slice(0, 10);
  }

  const dateList = getDatesInRange(startDate, endDate);
  const totalDays = dateList.length || 7;

  // Filter schedules that apply to this component
  const schedulesToUse = options?.simulatedDeliveries || activeDeliverySchedules.filter(
    (s) => s.componentCode === comp.componentCode && s.deliveryStatus !== 'CANCELLED'
  );

  // Daily Production Distribution
  // Uniform distribution across working days (e.g. Mon-Sat or all 7 days)
  const nonWorking = options?.nonWorkingDays || ['Sun'];
  const workingDates = dateList.filter((d) => {
    const dayName = new Date(d + 'T00:00:00').getDay();
    return dayName !== 0; // exclude Sunday by default
  });

  const effectiveWorkingDaysCount = workingDates.length > 0 ? workingDates.length : totalDays;
  const dailyFgTarget = effectiveWorkingDaysCount > 0
    ? Math.ceil(fgTotalGrossTarget / effectiveWorkingDaysCount)
    : 0;

  const dailyCompReq = Math.round(dailyFgTarget * bomQty);

  let rollingStock = initialStock;
  let firstStockoutDate: string | undefined = undefined;
  let stockoutDaysCount = 0;
  let totalPeriodRequirement = 0;
  let totalInwardScheduled = 0;

  const daySimulations: BOMGanttDaySimulation[] = dateList.map((dateStr, idx) => {
    const { label, weekday } = formatGanttDate(dateStr);
    const isWorking = !nonWorking.includes(weekday);
    const dayFgPlan = isWorking ? dailyFgTarget : 0;
    const dayReq = isWorking ? dailyCompReq : 0;
    totalPeriodRequirement += dayReq;

    // Inward arrivals on this specific date
    const arrivingDeliveries = schedulesToUse.filter((s) => s.expectedDeliveryDate === dateStr);
    const dayDeliveries: BOMGanttDayDelivery[] = arrivingDeliveries.map((s) => ({
      scheduleId: s.id,
      poNumber: s.poNumber || 'PO-PENDING',
      vendorName: s.vendorName,
      vendorCode: s.vendorCode,
      buyerName: s.buyerName,
      qty: s.promisedQty,
      deliveryStatus: s.deliveryStatus,
      notes: s.notes
    }));

    const totalInwardToday = dayDeliveries.reduce((sum, d) => sum + d.qty, 0);
    totalInwardScheduled += totalInwardToday;

    const startingStock = rollingStock;
    // Inward receipts arrive at start of shift/day
    const stockAfterInward = startingStock + totalInwardToday;
    const endingStock = stockAfterInward - dayReq;

    rollingStock = endingStock;

    const deficitToday = endingStock < 0 ? Math.abs(endingStock) : 0;
    const isStockout = endingStock < 0;

    if (isStockout) {
      stockoutDaysCount++;
      if (!firstStockoutDate) {
        firstStockoutDate = dateStr;
      }
    }

    // Determine Day Health Status
    let status: 'SAFE' | 'WARNING' | 'CRITICAL_STOPPAGE' = 'SAFE';
    if (isStockout) {
      status = 'CRITICAL_STOPPAGE'; // RED
    } else if (endingStock < safetyStock && safetyStock > 0) {
      status = 'WARNING'; // AMBER
    } else {
      status = 'SAFE'; // GREEN
    }

    // Production capacity supported today
    let productionCapacityPct = 100;
    let supportedFgUnitsToday = dayFgPlan;

    if (dayReq > 0) {
      if (stockAfterInward <= 0) {
        productionCapacityPct = 0;
        supportedFgUnitsToday = 0;
      } else if (stockAfterInward < dayReq) {
        supportedFgUnitsToday = Math.floor(stockAfterInward / (bomQty || 1));
        productionCapacityPct = Math.round((stockAfterInward / dayReq) * 100);
      }
    }

    return {
      date: dateStr,
      dayLabel: label,
      dayOfWeek: weekday,
      dayIndex: idx,
      isWorkingDay: isWorking,
      dailyFgPlan: dayFgPlan,
      dailyReq: dayReq,
      startingStock,
      inwardDeliveries: dayDeliveries,
      totalInwardToday,
      stockAfterInward,
      endingStock,
      deficitToday,
      isStockout,
      status,
      productionCapacityPct,
      supportedFgUnitsToday
    };
  });

  const isFeasible = stockoutDaysCount === 0;

  // Arrival evaluation analysis
  const primaryDelivery = schedulesToUse[0];
  let arrivalStatus: 'ON_TIME_SAFE' | 'ARRIVES_AFTER_STOCKOUT' | 'INSUFFICIENT_QTY' | 'NO_SCHEDULE' = 'ON_TIME_SAFE';
  let message = '';
  let daysDelayed: number | undefined = undefined;

  if (schedulesToUse.length === 0) {
    if (initialStock >= totalPeriodRequirement) {
      arrivalStatus = 'ON_TIME_SAFE';
      message = `Initial stock (${initialStock.toLocaleString()} ${comp.uom}) is sufficient for all ${totalDays} days. No delivery required.`;
    } else {
      arrivalStatus = 'NO_SCHEDULE';
      message = `🚨 CRITICAL: No vendor PO schedule exists! Stock runs out on ${formatGanttDate(firstStockoutDate || '').full}. Line halts for ${stockoutDaysCount} days.`;
    }
  } else {
    const totalPromised = schedulesToUse.reduce((sum, s) => sum + s.promisedQty, 0);
    const netDeficit = totalPeriodRequirement - initialStock;

    if (isFeasible) {
      arrivalStatus = 'ON_TIME_SAFE';
      const dates = schedulesToUse.map((s) => formatGanttDate(s.expectedDeliveryDate).label).join(', ');
      message = `✅ ON TRACK & FEASIBLE: Expected arrival on [${dates}] (+${totalPromised.toLocaleString()} ${comp.uom}) arrives in time before stockout. Daily production of ${dailyFgTarget.toLocaleString()} FGs/day is fully protected.`;
    } else {
      // Stockout happened
      if (primaryDelivery && firstStockoutDate) {
        const stockoutD = new Date(firstStockoutDate);
        const arrivalD = new Date(primaryDelivery.expectedDeliveryDate);
        const diffDays = Math.round((arrivalD.getTime() - stockoutD.getTime()) / (1000 * 60 * 60 * 24));
        
        if (diffDays > 0) {
          daysDelayed = diffDays;
          arrivalStatus = 'ARRIVES_AFTER_STOCKOUT';
          message = `❌ CRITICAL ARRIVAL DELAY: Stock runs out on ${formatGanttDate(firstStockoutDate).full}, but vendor delivery is scheduled on ${formatGanttDate(primaryDelivery.expectedDeliveryDate).full} (${diffDays} days LATE). Line will halt between ${formatGanttDate(firstStockoutDate).label} and ${formatGanttDate(primaryDelivery.expectedDeliveryDate).label}!`;
        } else if (totalPromised < netDeficit) {
          arrivalStatus = 'INSUFFICIENT_QTY';
          message = `❌ CRITICAL INSUFFICIENT BATCH: Vendor promised ${totalPromised.toLocaleString()} ${comp.uom}, but line requires ${netDeficit.toLocaleString()} ${comp.uom}. Deficit of ${(netDeficit - totalPromised).toLocaleString()} ${comp.uom} causes line stoppage on ${formatGanttDate(firstStockoutDate).full}.`;
        } else {
          arrivalStatus = 'ARRIVES_AFTER_STOCKOUT';
          message = `❌ CRITICAL TIMING GAP: Delivery on ${formatGanttDate(primaryDelivery.expectedDeliveryDate).full} cannot prevent stockout on ${formatGanttDate(firstStockoutDate).full}. Need expedited arrival by ${formatGanttDate(firstStockoutDate).label}.`;
        }
      } else {
        arrivalStatus = 'INSUFFICIENT_QTY';
        message = `❌ CRITICAL: Inward deliveries do not meet daily production requirements. Stockout occurs on ${formatGanttDate(firstStockoutDate || '').full}.`;
      }
    }
  }

  // Critical Path Analysis
  const minEndingStock = Math.min(...daySimulations.map((d) => d.endingStock));
  const criticalStockoutDates = daySimulations.filter((d) => d.isStockout).map((d) => d.date);
  const gatingDeliveryDates = daySimulations.filter((d) => d.totalInwardToday > 0).map((d) => d.date);

  let slackDays = 0;
  let isCriticalPath = false;
  let delayInFgDays = 0;
  let impactOnFinalDelivery = '';
  let criticalChainSummary = '';

  if (stockoutDaysCount > 0) {
    isCriticalPath = true;
    slackDays = -stockoutDaysCount;
    delayInFgDays = stockoutDaysCount;
    impactOnFinalDelivery = `Directly halts assembly on ${formatGanttDate(firstStockoutDate || '').label}, delaying FG delivery by ${stockoutDaysCount} day(s).`;
    criticalChainSummary = `Vendor Delivery ${primaryDelivery?.expectedDeliveryDate ? formatGanttDate(primaryDelivery.expectedDeliveryDate).label : 'Pending'} ➔ Stockout on ${formatGanttDate(firstStockoutDate || '').label} ➔ FG Delivery delayed by ${stockoutDaysCount}d`;
  } else {
    // Calculate positive float
    slackDays = dailyCompReq > 0 ? Math.floor(Math.max(0, minEndingStock) / dailyCompReq) : 5;
    if (slackDays <= 1) {
      isCriticalPath = true; // Zero float bottleneck
      delayInFgDays = 0;
      impactOnFinalDelivery = `Zero/low float (${slackDays} day buffer). Any vendor delay will immediately delay final FG dispatch.`;
      criticalChainSummary = `Tight buffer (${slackDays}d) ➔ Critical Path Watch`;
    } else {
      isCriticalPath = false;
      delayInFgDays = 0;
      impactOnFinalDelivery = `Non-critical float: +${slackDays} day(s) buffer available before FG delivery is impacted.`;
      criticalChainSummary = `Safe float (+${slackDays}d buffer)`;
    }
  }

  return {
    componentCode: comp.componentCode,
    componentDescription: comp.componentDescription,
    fgCode,
    fgDescription,
    uom: comp.uom,
    bomQty,
    initialStock,
    safetyStock,
    totalPeriodRequirement,
    totalInwardScheduled,
    days: daySimulations,
    isFeasible,
    firstStockoutDate,
    stockoutDaysCount,
    criticalPath: {
      isCriticalPath,
      slackDays,
      criticalDays: criticalStockoutDates,
      gatingDeliveryDates,
      impactOnFinalDelivery,
      delayInFgDays,
      recommendedExpediteDate: firstStockoutDate,
      criticalChainSummary
    },
    arrivalEvaluation: {
      primaryArrivalDate: primaryDelivery?.expectedDeliveryDate,
      primaryArrivalQty: primaryDelivery?.promisedQty,
      arrivalStatus,
      message,
      stockoutDate: firstStockoutDate,
      daysDelayed
    }
  };
}
