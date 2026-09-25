import logging
from typing import List, Dict, Any, Union

logger = logging.getLogger(__name__)


class ProrateService:
    @staticmethod
    def prorate(monthly_target: int, weeks: list) -> Dict[str, int]:
        """
        Prorate monthly_target across weeks proportional to working_days,
        with any remainder allocated to the final week.

        Algorithm (Section 9):
        1. Calculate total_working_days = sum(week.working_days for week in weeks)
        2. If total_working_days <= 0 or no weeks: fallback evenly with remainder to last week.
        3. For week_1 to week_(N-1):
           prorated_qty = round(monthly_target * (week.working_days / total_working_days))
           allocated += prorated_qty
        4. For week_N (final week):
           prorated_qty = max(0, monthly_target - allocated)  # gets the exact remainder
        """
        if not weeks or monthly_target <= 0:
            return {}

        # Sort weeks by week_no if available
        sorted_weeks = sorted(
            weeks,
            key=lambda w: getattr(w, 'week_no', 0) if hasattr(w, 'week_no') else (w.get('week_no', 0) if isinstance(w, dict) else 0)
        )

        def get_week_code(w):
            return getattr(w, 'week_code', None) or (w.get('week_code') or w.get('id') if isinstance(w, dict) else str(w))

        def get_working_days(w):
            if hasattr(w, 'working_days'):
                return int(w.working_days)
            if isinstance(w, dict):
                return int(w.get('working_days', w.get('workingDays', w.get('days_count', w.get('daysCount', 0)))))
            return 0

        total_working_days = sum(get_working_days(w) for w in sorted_weeks)
        breakdown: Dict[str, int] = {}

        if total_working_days <= 0:
            # Fallback: distribute evenly across weeks with remainder to last week
            n_weeks = len(sorted_weeks)
            share = int(monthly_target // n_weeks)
            for w in sorted_weeks:
                breakdown[get_week_code(w)] = share
            last_code = get_week_code(sorted_weeks[-1])
            breakdown[last_code] += int(monthly_target - (share * n_weeks))
            return breakdown

        allocated = 0
        for i, week in enumerate(sorted_weeks):
            code = get_week_code(week)
            if i == len(sorted_weeks) - 1:
                # Remainder to the last week
                breakdown[code] = max(0, int(monthly_target - allocated))
            else:
                w_days = get_working_days(week)
                portion = int(round((monthly_target * w_days) / total_working_days))
                breakdown[code] = portion
                allocated += portion

        return breakdown

    @staticmethod
    def cascade_reprorate(month: str) -> int:
        """
        Re-run proration on all monthly_plan rows for the affected month.
        Called whenever week definitions change (e.g. dates or holiday_days modified).
        Returns the number of monthly_plan records updated.
        """
        clean_month = month.strip()
        try:
            from core.models import MonthlyPlan, WeekDefinition

            weeks = list(WeekDefinition.objects.filter(month=clean_month).order_by('week_no'))
            if not weeks:
                logger.warning(f"No week definitions found for month {clean_month}. Cannot cascade reprorate.")
                return 0

            plans = MonthlyPlan.objects.filter(month=clean_month)
            updated_count = 0

            for plan in plans:
                plan.weekly_breakdown = ProrateService.prorate(plan.monthly_target, weeks)
                plan.save(update_fields=['weekly_breakdown', 'updated_at'])
                updated_count += 1

            logger.info(f"Successfully re-prorated {updated_count} monthly plan(s) for {clean_month}.")
            return updated_count

        except Exception as e:
            logger.error(f"Error in ProrateService.cascade_reprorate({clean_month}): {e}")
            return 0

    @staticmethod
    def prorate_plan_instance(plan, weeks) -> None:
        """
        Helper method to recalculate weekly_breakdown for a plan instance and save.
        """
        plan.weekly_breakdown = ProrateService.prorate(plan.monthly_target, weeks)
        plan.save(update_fields=['weekly_breakdown', 'updated_at'])
