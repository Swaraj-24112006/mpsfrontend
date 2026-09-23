from django.db import models


class RMPMComponentMaster(models.Model):
    CATEGORY_CHOICES = (
        ('RM', 'Raw Material'),
        ('PM', 'Packaging Material'),
    )

    component_code = models.CharField(
        max_length=100,
        unique=True,
        db_index=True,
        help_text="Unique component identifier (must not start with '7')"
    )
    component_description = models.CharField(max_length=255)
    category = models.CharField(max_length=10, choices=CATEGORY_CHOICES, default='RM', db_index=True)
    uom = models.CharField(max_length=20, default='PC')
    default_storage_location = models.CharField(max_length=50, blank=True, default='')
    safety_stock = models.DecimalField(max_digits=12, decimal_places=3, default=0.000)
    is_critical = models.BooleanField(default=False)
    is_common_part = models.BooleanField(default=False, db_index=True)
    shared_in_fgs_count = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True, db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'rm_pm_component_master'
        verbose_name = 'RM/PM Component Master'
        verbose_name_plural = 'RM/PM Component Master'
        ordering = ['component_code']
        indexes = [
            models.Index(fields=['category']),
            models.Index(fields=['is_common_part']),
            models.Index(fields=['is_active']),
        ]

    def __str__(self):
        return f"{self.component_code} - {self.component_description}"


class BOMFGHeader(models.Model):
    fg_code = models.CharField(
        max_length=100,
        unique=True,
        db_index=True,
        help_text="Finished good identifier (must start with '7')"
    )
    fg_description = models.CharField(max_length=255)
    mini_factory = models.CharField(max_length=100, blank=True, default='')
    line = models.CharField(max_length=100, blank=True, default='')
    customer_segment = models.CharField(max_length=100, blank=True, default='')
    unit_price_inr = models.DecimalField(max_digits=12, decimal_places=2, default=1000.00)
    active_bom_version = models.CharField(max_length=20, default='v1')
    uom = models.CharField(max_length=20, default='PC')
    is_active = models.BooleanField(default=True, db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'bom_fg_header'
        verbose_name = 'BOM Finished Good Header'
        verbose_name_plural = 'BOM Finished Good Headers'
        ordering = ['fg_code']
        indexes = [
            models.Index(fields=['mini_factory']),
            models.Index(fields=['line']),
            models.Index(fields=['is_active']),
        ]

    def __str__(self):
        return f"{self.fg_code} - {self.fg_description}"


class BOMMaster(models.Model):
    fg = models.ForeignKey(
        BOMFGHeader,
        to_field='fg_code',
        db_column='fg_code',
        on_delete=models.CASCADE,
        related_name='bom_lines'
    )
    component = models.ForeignKey(
        RMPMComponentMaster,
        to_field='component_code',
        db_column='component_code',
        on_delete=models.CASCADE,
        related_name='bom_usages'
    )
    qty = models.DecimalField(max_digits=12, decimal_places=4, default=1.0000)
    uom = models.CharField(max_length=20, default='PC')
    component_role = models.CharField(max_length=50, blank=True, default='')
    bom_version = models.CharField(max_length=20, default='v1')
    is_active = models.BooleanField(default=True, db_index=True)
    lead_time_days_override = models.IntegerField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'bom_master'
        verbose_name = 'BOM Master'
        verbose_name_plural = 'BOM Master Lines'
        ordering = ['fg', 'component']
        constraints = [
            models.UniqueConstraint(
                fields=['fg', 'component', 'bom_version'],
                name='unique_bom_entry_per_version'
            )
        ]
        indexes = [
            models.Index(fields=['fg', 'bom_version', 'is_active']),
            models.Index(fields=['component']),
            models.Index(fields=['is_active']),
            models.Index(fields=['bom_version']),
        ]

    def __str__(self):
        return f"{self.fg_id} -> {self.component_id} ({self.qty} {self.uom})"


from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

@receiver([post_save, post_delete], sender=BOMMaster)
def on_bom_master_change(sender, instance, **kwargs):
    if instance.component_id:
        from core.services.bom_service import BOMService
        BOMService.update_common_part_flags(instance.component_id)


class VendorBuyerMaster(models.Model):
    CATEGORY_CHOICES = (
        ('RM', 'Raw Material'),
        ('PM', 'Packaging Material'),
    )

    vendor_code = models.CharField(max_length=100, unique=True, db_index=True)
    vendor_name = models.CharField(max_length=255, db_index=True)
    buyer_name = models.CharField(max_length=255, db_index=True)
    buyer_email = models.EmailField(blank=True, default='')
    buyer_phone = models.CharField(max_length=50, blank=True, default='')
    category = models.CharField(max_length=10, choices=CATEGORY_CHOICES, default='RM', db_index=True)
    lead_time_days = models.IntegerField(default=7)
    city = models.CharField(max_length=100, blank=True, default='')
    gst_no = models.CharField(max_length=50, blank=True, default='')
    is_active = models.BooleanField(default=True, db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'vendor_buyer_master'
        verbose_name = 'Vendor Buyer Master'
        verbose_name_plural = 'Vendor Buyer Master'
        ordering = ['vendor_code']
        indexes = [
            models.Index(fields=['vendor_name']),
            models.Index(fields=['buyer_name']),
            models.Index(fields=['category']),
            models.Index(fields=['is_active']),
        ]

    def __str__(self):
        return f"{self.vendor_code} - {self.vendor_name} ({self.buyer_name})"

    @property
    def supplied_components(self):
        return list(self.supplied_components_rel.values_list('component_id', flat=True))



class VendorSuppliedComponent(models.Model):
    vendor_buyer = models.ForeignKey(
        VendorBuyerMaster,
        on_delete=models.CASCADE,
        related_name='supplied_components_rel'
    )
    component = models.ForeignKey(
        RMPMComponentMaster,
        to_field='component_code',
        db_column='component_code',
        on_delete=models.CASCADE,
        related_name='vendor_suppliers'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'vendor_supplied_components'
        verbose_name = 'Vendor Supplied Component'
        verbose_name_plural = 'Vendor Supplied Components'
        ordering = ['vendor_buyer', 'component']
        constraints = [
            models.UniqueConstraint(
                fields=['vendor_buyer', 'component'],
                name='unique_vendor_supplied_component'
            )
        ]
        indexes = [
            models.Index(fields=['vendor_buyer']),
            models.Index(fields=['component']),
        ]

    def __str__(self):
        return f"{self.vendor_buyer.vendor_code} supplies {self.component_id}"


class UploadBatch(models.Model):
    UPLOAD_TYPE_CHOICES = (
        ('BOM_UPLOAD', 'BOM Upload'),
        ('MONTHLY_PLAN', 'Monthly Plan'),
        ('MB51_REPORT', 'MB51 Report'),
        ('STOCK_REPORT', 'Stock Report'),
        ('VENDOR_DELIVERY_SCHEDULE', 'Vendor Delivery Schedule'),
        ('OTHER', 'Other Upload'),
    )

    STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('PROCESSING', 'Processing'),
        ('COMPLETED', 'Completed'),
        ('PARTIAL', 'Partial Success'),
        ('FAILED', 'Failed'),
    )

    upload_type = models.CharField(max_length=50, choices=UPLOAD_TYPE_CHOICES)
    uploaded_by = models.CharField(max_length=150, blank=True, default='system')
    uploaded_at = models.DateTimeField(auto_now_add=True, db_index=True)
    file_name = models.CharField(max_length=255)
    minio_path = models.CharField(max_length=500, blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING', db_index=True)
    total_rows = models.IntegerField(default=0)
    imported_rows = models.IntegerField(default=0)
    error_rows = models.IntegerField(default=0)
    error_detail = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = 'upload_batch'
        verbose_name = 'Upload Batch'
        verbose_name_plural = 'Upload Batches'
        ordering = ['-uploaded_at']
        indexes = [
            models.Index(fields=['upload_type', 'status']),
            models.Index(fields=['-uploaded_at']),
        ]

    def __str__(self):
        return f"Batch #{self.id} - {self.upload_type} ({self.status}) - {self.file_name}"


