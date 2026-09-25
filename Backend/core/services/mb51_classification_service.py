class MB51ClassificationService:
    """
    Service to classify SAP MB51 material movement document transactions:
    - Movement 101 + Part Number starting with '7' -> 'FG_PRODUCTION_RECEIPT'
    - Movement 101 + Part Number NOT starting with '7' -> 'RMPM_RECEIPT'
    - Movement 601 -> 'FG_DISPATCH'
    - All other movement types -> 'OTHER'
    """

    FG_PRODUCTION_RECEIPT = 'FG_PRODUCTION_RECEIPT'
    RMPM_RECEIPT = 'RMPM_RECEIPT'
    FG_DISPATCH = 'FG_DISPATCH'
    OTHER = 'OTHER'

    @classmethod
    def classify(cls, movement_type: str, part_number: str) -> str:
        """
        Classifies transaction based on SAP movement type and part number prefix.

        :param movement_type: SAP movement type (e.g. '101', '601', '102')
        :param part_number: Finished good or component part number
        :return: One of ('FG_PRODUCTION_RECEIPT', 'RMPM_RECEIPT', 'FG_DISPATCH', 'OTHER')
        """
        mvt = str(movement_type or '').strip()
        part = str(part_number or '').strip()

        if mvt == '101':
            if part.startswith('7'):
                return cls.FG_PRODUCTION_RECEIPT
            return cls.RMPM_RECEIPT
        elif mvt == '601':
            return cls.FG_DISPATCH

        return cls.OTHER
