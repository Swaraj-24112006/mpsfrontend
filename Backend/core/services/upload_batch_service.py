import logging
from typing import Optional, Union, Dict, Any
from core.models import UploadBatch

logger = logging.getLogger(__name__)


class UploadBatchService:
    """
    Centralized service for managing and tracking bulk upload batches.
    Reused across all dashboards for file ingestion audit trails.
    """

    @classmethod
    def create_batch(
        cls,
        upload_type: str,
        user: str = 'system',
        file_name: str = '',
        minio_path: str = '',
        total_rows: int = 0,
        uploaded_by: Optional[str] = None
    ) -> UploadBatch:
        """
        Creates a new upload batch with PENDING status.
        """
        actor = uploaded_by or user or 'system'
        batch = UploadBatch.objects.create(
            upload_type=upload_type,
            uploaded_by=actor,
            file_name=file_name,
            minio_path=minio_path,
            status='PENDING',
            total_rows=total_rows,
            imported_rows=0,
            error_rows=0,
            error_detail={}
        )
        logger.info(f"[UploadBatchService] Created batch #{batch.id} ({upload_type}) for file '{file_name}'")
        return batch

    @classmethod
    def complete(
        cls,
        batch: UploadBatch,
        imported_rows: int,
        error_rows: int = 0,
        error_detail: Optional[Dict[str, Any]] = None
    ) -> UploadBatch:
        """
        Marks batch as COMPLETED (if error_rows == 0) or PARTIAL (if error_rows > 0 and imported > 0),
        or FAILED if imported == 0 and error_rows > 0.
        """
        if error_rows > 0 and imported_rows > 0:
            status = 'PARTIAL'
        elif error_rows > 0 and imported_rows == 0:
            status = 'FAILED'
        else:
            status = 'COMPLETED'

        batch.imported_rows = imported_rows
        batch.error_rows = error_rows
        batch.status = status
        batch.error_detail = error_detail or {}
        batch.save(update_fields=['imported_rows', 'error_rows', 'status', 'error_detail'])

        logger.info(
            f"[UploadBatchService] Completed batch #{batch.id}: status={status}, "
            f"imported={imported_rows}, errors={error_rows}"
        )
        return batch

    @classmethod
    def fail(
        cls,
        batch: UploadBatch,
        error: Union[str, Dict[str, Any]]
    ) -> UploadBatch:
        """
        Marks batch as FAILED and records the error details.
        """
        batch.status = 'FAILED'
        if isinstance(error, dict):
            batch.error_detail = error
        else:
            batch.error_detail = {'error': str(error)}

        batch.save(update_fields=['status', 'error_detail'])
        logger.warning(f"[UploadBatchService] Batch #{batch.id} failed: {error}")
        return batch
