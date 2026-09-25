from datetime import date, datetime
from typing import Optional, Iterable, Any


class WeekMappingService:
    """
    Service to map transaction posting dates to defined week buckets
    based on week start_date and end_date ranges.
    """

    @classmethod
    def parse_date(cls, val: Any) -> Optional[date]:
        """
        Parses date strings (YYYY-MM-DD or ISO 8601), datetime, or date objects into datetime.date.
        """
        if not val:
            return None
        if isinstance(val, datetime):
            return val.date()
        if isinstance(val, date):
            return val
        if isinstance(val, str):
            clean_str = val.strip().replace('Z', '').split('T')[0]
            try:
                return datetime.strptime(clean_str[:10], '%Y-%m-%d').date()
            except ValueError:
                try:
                    return datetime.fromisoformat(clean_str).date()
                except ValueError:
                    return None
        return None

    @classmethod
    def map_to_week(cls, posting_date: Any, week_definitions: Optional[Iterable[Any]] = None) -> Optional[str]:
        """
        Scans week definitions and returns the week_code where start_date <= posting_date <= end_date.
        If week_definitions is not provided or empty, queries WeekDefinition records from the database.

        :param posting_date: Date object, datetime object, or date string
        :param week_definitions: Optional iterable of WeekDefinition model instances
        :return: week_code string (e.g. 'w-2026-08-01') or None if not found
        """
        target_date = cls.parse_date(posting_date)
        if not target_date:
            return None

        if week_definitions is not None:
            # Sort by start_date ascending for deterministic matching
            sorted_weeks = sorted(week_definitions, key=lambda w: w.start_date)
            for w in sorted_weeks:
                if w.start_date <= target_date <= w.end_date:
                    return w.week_code
            return None

        # Fallback to direct DB query
        from core.models import WeekDefinition
        matched = WeekDefinition.objects.filter(
            start_date__lte=target_date,
            end_date__gte=target_date
        ).order_by('start_date').first()

        return matched.week_code if matched else None

    @classmethod
    def is_date_in_week(cls, posting_date: Any, week_definition: Any) -> bool:
        """
        Determines whether a given posting date falls within the boundary
        of the specified WeekDefinition instance.
        """
        if not week_definition:
            return False
        target_date = cls.parse_date(posting_date)
        if not target_date:
            return False

        return week_definition.start_date <= target_date <= week_definition.end_date
