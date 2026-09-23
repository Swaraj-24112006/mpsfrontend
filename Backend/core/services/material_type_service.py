from typing import Optional


class MaterialTypeService:
    """
    Derives material classification ('FG', 'RM', 'PM') based on SAP part numbering rules:
    - Parts starting with '7' (e.g., 7.06496.03.0, 7001001) are Finished Goods ('FG').
    - Non-7 parts are Raw Materials ('RM') or Packaging Materials ('PM').
    """

    PM_PATTERNS = (
        'PM-', 'PM_', 'PKG', 'BOX', 'TAPE', 'PALLET', 'POLY',
        'BAG', 'PACK', 'CARTON', 'LABEL', 'CORRUGATED', 'STRAP'
    )

    @classmethod
    def derive(cls, part_number: Optional[str]) -> str:
        """
        Derives 'FG', 'RM', or 'PM' from a given part number.
        """
        if not part_number:
            return 'RM'

        clean_part = str(part_number).strip().upper()

        # Rule 1: Starts with '7' -> Finished Good (FG)
        if clean_part.startswith('7'):
            return 'FG'

        # Rule 2: Database check if component exists with explicit category
        try:
            from core.models import RMPMComponentMaster
            comp = RMPMComponentMaster.objects.filter(component_code=clean_part).only('category').first()
            if comp and comp.category in ('RM', 'PM'):
                return comp.category
        except Exception:
            pass

        # Rule 3: Check for packaging material naming patterns
        for pattern in cls.PM_PATTERNS:
            if pattern in clean_part:
                return 'PM'

        # Rule 4: Default non-7 part is Raw Material (RM)
        return 'RM'
