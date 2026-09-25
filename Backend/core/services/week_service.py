import calendar
from datetime import date, datetime
from typing import List, Tuple, Dict, Any


class WeekService:
    @staticmethod
    def generate_week_code(month: str, week_no: int) -> str:
        """
        Generate standard week_code format: w-{YYYY-MM}-{0N}
        Example: month='2026-08', week_no=1 -> 'w-2026-08-01'
        """
        clean_month = month.strip()
        return f"w-{clean_month}-{int(week_no):02d}"

    @staticmethod
    def compute_days(start_date: Any, end_date: Any, holiday_days: int = 0) -> Tuple[int, int]:
        """
        Compute (days_count, working_days) server-side.
        days_count = inclusive days from start_date to end_date.
        working_days = max(0, days_count - holiday_days).
        """
        if isinstance(start_date, str):
            start_date = datetime.strptime(start_date.strip(), "%Y-%m-%d").date()
        elif isinstance(start_date, datetime):
            start_date = start_date.date()

        if isinstance(end_date, str):
            end_date = datetime.strptime(end_date.strip(), "%Y-%m-%d").date()
        elif isinstance(end_date, datetime):
            end_date = end_date.date()

        if end_date < start_date:
            raise ValueError(f"End date ({end_date}) cannot be before start date ({start_date})")

        days_count = (end_date - start_date).days + 1
        holiday = max(0, int(holiday_days or 0))
        working_days = max(0, days_count - holiday)

        return days_count, working_days

    @staticmethod
    def get_standard_week_data_for_month(month: str) -> List[Dict[str, Any]]:
        """
        Generate standard 4-week factory breakdown for a given month (YYYY-MM):
        - Week 1: 01 to 09 (9 days, 8 working days, 1 holiday)
        - Week 2: 10 to 16 (7 days, 6 working days, 1 holiday)
        - Week 3: 17 to 23 (7 days, 6 working days, 1 holiday)
        - Week 4: 24 to month-end (remaining days, remaining - 1 working days, 1 holiday)
        """
        parts = month.strip().split('-')
        if len(parts) != 2:
            raise ValueError(f"Invalid month format '{month}'. Expected YYYY-MM.")

        year = int(parts[0])
        month_num = int(parts[1])
        if not (1 <= month_num <= 12):
            raise ValueError(f"Invalid month number {month_num}. Must be 1-12.")

        days_in_month = calendar.monthrange(year, month_num)[1]
        month_short = calendar.month_abbr[month_num]

        w1_start = date(year, month_num, 1)
        w1_end = date(year, month_num, 9)

        w2_start = date(year, month_num, 10)
        w2_end = date(year, month_num, 16)

        w3_start = date(year, month_num, 17)
        w3_end = date(year, month_num, 23)

        w4_start = date(year, month_num, 24)
        w4_end = date(year, month_num, days_in_month)
        w4_days = (w4_end - w4_start).days + 1
        w4_working = max(0, w4_days - 1)

        return [
            {
                "month": month,
                "week_no": 1,
                "week_code": WeekService.generate_week_code(month, 1),
                "week_label": f"Week 1 (01-09 {month_short})",
                "start_date": w1_start,
                "end_date": w1_end,
                "days_count": 9,
                "holiday_days": 1,
                "working_days": 8,
            },
            {
                "month": month,
                "week_no": 2,
                "week_code": WeekService.generate_week_code(month, 2),
                "week_label": f"Week 2 (10-16 {month_short})",
                "start_date": w2_start,
                "end_date": w2_end,
                "days_count": 7,
                "holiday_days": 1,
                "working_days": 6,
            },
            {
                "month": month,
                "week_no": 3,
                "week_code": WeekService.generate_week_code(month, 3),
                "week_label": f"Week 3 (17-23 {month_short})",
                "start_date": w3_start,
                "end_date": w3_end,
                "days_count": 7,
                "holiday_days": 1,
                "working_days": 6,
            },
            {
                "month": month,
                "week_no": 4,
                "week_code": WeekService.generate_week_code(month, 4),
                "week_label": f"Week 4 (24-{days_in_month:02d} {month_short})",
                "start_date": w4_start,
                "end_date": w4_end,
                "days_count": w4_days,
                "holiday_days": 1,
                "working_days": w4_working,
            },
        ]
