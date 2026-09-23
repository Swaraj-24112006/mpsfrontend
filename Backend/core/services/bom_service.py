import logging
from typing import Optional

logger = logging.getLogger(__name__)


class BOMService:
    """
    Business logic and analytics for BOM (Bill of Materials).
    """

    @classmethod
    def update_common_part_flags(cls, component_code: Optional[str]) -> tuple[bool, int]:
        """
        After any BOM insert, update, or delete:
        Count distinct fg_code values for this component_code across active BOM items.
        Update rm_pm_component_master.is_common_part and shared_in_fgs_count.
        Returns (is_common_part, shared_in_fgs_count).
        """
        if not component_code:
            return False, 0

        clean_code = str(component_code).strip().upper()

        try:
            from core.models import BOMMaster, RMPMComponentMaster

            # Count distinct FGs consuming this component in active BOMs
            distinct_fgs = BOMMaster.objects.filter(
                component_id=clean_code,
                is_active=True
            ).values('fg_id').distinct().count()

            is_common = distinct_fgs > 1

            RMPMComponentMaster.objects.filter(component_code=clean_code).update(
                is_common_part=is_common,
                shared_in_fgs_count=distinct_fgs
            )

            logger.info(
                f"[BOMService] Updated common part flags for {clean_code}: "
                f"shared_in_fgs_count={distinct_fgs}, is_common_part={is_common}"
            )
            return is_common, distinct_fgs

        except Exception as e:
            logger.error(f"[BOMService] Error updating common part flags for {clean_code}: {e}")
            return False, 0
