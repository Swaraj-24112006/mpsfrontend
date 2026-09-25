from django.db import transaction
from rest_framework import serializers
from .models import (
    RMPMComponentMaster,
    BOMFGHeader,
    BOMMaster,
    VendorBuyerMaster,
    VendorSuppliedComponent,
    UploadBatch,
    WeekDefinition,
    MonthlyPlan,
    MB51Transaction,
    StockReport
)
from core.services.week_service import WeekService
from core.services.prorate_service import ProrateService
from core.services.mb51_classification_service import MB51ClassificationService
from core.services.week_mapping_service import WeekMappingService
from core.services.material_type_service import MaterialTypeService


class RMPMComponentSerializer(serializers.ModelSerializer):
    """
    Serializer for RM/PM Component Master.
    Enforces that component_code is required on creation, unique,
    cannot start with '7' (which is reserved for Finished Goods),
    and becomes read-only once created.
    """

    class Meta:
        model = RMPMComponentMaster
        fields = [
            'id',
            'component_code',
            'component_description',
            'category',
            'uom',
            'default_storage_location',
            'safety_stock',
            'is_critical',
            'is_common_part',
            'shared_in_fgs_count',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'is_common_part', 'shared_in_fgs_count', 'created_at', 'updated_at']

    def get_fields(self):
        fields = super().get_fields()
        # When updating an existing component, component_code cannot be modified
        if self.instance is not None:
            fields['component_code'].read_only = True
        return fields

    def validate_component_code(self, value):
        code = value.strip().upper()
        if code.startswith('7'):
            raise serializers.ValidationError(
                "Component code cannot start with '7' (prefix '7' is strictly reserved for Finished Goods FG)."
            )
        return code

    def validate_safety_stock(self, value):
        if value < 0:
            raise serializers.ValidationError("Safety stock cannot be negative.")
        return value


class BOMFGHeaderSerializer(serializers.ModelSerializer):
    """
    Serializer for Finished Good (FG) Header Master.
    Enforces that fg_code must start with '7' and becomes read-only once created.
    """

    class Meta:
        model = BOMFGHeader
        fields = [
            'id',
            'fg_code',
            'fg_description',
            'mini_factory',
            'line',
            'customer_segment',
            'unit_price_inr',
            'active_bom_version',
            'uom',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_fields(self):
        fields = super().get_fields()
        # When updating an existing FG Header, fg_code cannot be modified
        if self.instance is not None:
            fields['fg_code'].read_only = True
        return fields

    def validate_fg_code(self, value):
        code = value.strip()
        if not code.startswith('7'):
            raise serializers.ValidationError(
                "Finished Good code (fg_code) must start with '7'."
            )
        return code

    def validate_unit_price_inr(self, value):
        if value < 0:
            raise serializers.ValidationError("Unit price cannot be negative.")
        return value


class BOMMasterSerializer(serializers.ModelSerializer):
    """
    Serializer for BOM Master lines mapping FG headers to components.
    Includes nested component details and validates usage multiplier and part prefixes.
    """
    fg_code = serializers.SlugRelatedField(
        slug_field='fg_code',
        queryset=BOMFGHeader.objects.all(),
        source='fg'
    )
    component_code = serializers.SlugRelatedField(
        slug_field='component_code',
        queryset=RMPMComponentMaster.objects.all(),
        source='component'
    )
    fg_description = serializers.CharField(source='fg.fg_description', read_only=True)
    component_description = serializers.SerializerMethodField()
    category = serializers.SerializerMethodField()

    class Meta:
        model = BOMMaster
        fields = [
            'id',
            'fg_code',
            'fg_description',
            'component_code',
            'component_description',
            'category',
            'component_role',
            'qty',
            'uom',
            'bom_version',
            'is_active',
            'lead_time_days_override',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'fg_description', 'component_description', 'category', 'created_at', 'updated_at']

    def get_component_description(self, obj):
        return obj.component.component_description if obj.component else ''

    def get_category(self, obj):
        return obj.component.category if obj.component else ''

    def validate_qty(self, value):
        if value <= 0:
            raise serializers.ValidationError("Usage quantity (qty) must be strictly greater than 0.")
        return value

    def validate(self, attrs):
        fg = attrs.get('fg') or (self.instance.fg if self.instance else None)
        component = attrs.get('component') or (self.instance.component if self.instance else None)

        if fg and not fg.fg_code.startswith('7'):
            raise serializers.ValidationError({"fg_code": "Finished Good code must start with '7'."})

        if component and component.component_code.startswith('7'):
            raise serializers.ValidationError({"component_code": "Component code cannot start with '7'."})

        return attrs


class VendorBuyerSerializer(serializers.ModelSerializer):
    """
    Serializer for Vendor and Buyer relationship master.
    Includes nested supplied_components list of component codes.
    On save/update, manages the junction table vendor_supplied_components.
    """
    supplied_components = serializers.ListField(
        child=serializers.CharField(max_length=100),
        required=True,
        allow_empty=False
    )

    class Meta:
        model = VendorBuyerMaster
        fields = [
            'id',
            'vendor_code',
            'vendor_name',
            'buyer_name',
            'buyer_email',
            'buyer_phone',
            'category',
            'lead_time_days',
            'city',
            'gst_no',
            'is_active',
            'supplied_components',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Pull list of component codes from the junction table
        data['supplied_components'] = list(
            instance.supplied_components_rel.values_list('component_id', flat=True)
        )
        return data

    def validate_lead_time_days(self, value):
        if value <= 0:
            raise serializers.ValidationError("Lead time days must be greater than 0.")
        return value

    def validate_supplied_components(self, values):
        if not values or len(values) == 0:
            raise serializers.ValidationError("At least one component must be supplied by the vendor.")

        # Deduplicate while preserving order
        clean_codes = list(dict.fromkeys([c.strip().upper() for c in values if c and c.strip()]))
        if not clean_codes:
            raise serializers.ValidationError("At least one valid component code must be supplied.")

        # Verify all supplied components exist in RMPMComponentMaster
        existing_codes = set(
            RMPMComponentMaster.objects.filter(component_code__in=clean_codes).values_list('component_code', flat=True)
        )
        missing = [c for c in clean_codes if c not in existing_codes]
        if missing:
            raise serializers.ValidationError(
                f"The following components do not exist in RM/PM Component Master: {', '.join(missing)}"
            )

        return clean_codes

    @transaction.atomic
    def create(self, validated_data):
        supplied_components = validated_data.pop('supplied_components', [])
        vendor_buyer = VendorBuyerMaster.objects.create(**validated_data)

        # Bulk create junction rows
        junction_rows = [
            VendorSuppliedComponent(vendor_buyer=vendor_buyer, component_id=code)
            for code in supplied_components
        ]
        VendorSuppliedComponent.objects.bulk_create(junction_rows)

        return vendor_buyer

    @transaction.atomic
    def update(self, instance, validated_data):
        supplied_components = validated_data.pop('supplied_components', None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if supplied_components is not None:
            # Delete existing and recreate
            instance.supplied_components_rel.all().delete()
            junction_rows = [
                VendorSuppliedComponent(vendor_buyer=instance, component_id=code)
                for code in supplied_components
            ]
            VendorSuppliedComponent.objects.bulk_create(junction_rows)

        return instance


class UploadBatchSerializer(serializers.ModelSerializer):
    """
    Read-only serializer for tracking file ingestion history.
    """
    class Meta:
        model = UploadBatch
        fields = [
            'id',
            'upload_type',
            'uploaded_by',
            'uploaded_at',
            'file_name',
            'minio_path',
            'status',
            'total_rows',
            'imported_rows',
            'error_rows',
            'error_detail',
        ]
        read_only_fields = [
            'id',
            'upload_type',
            'uploaded_by',
            'uploaded_at',
            'file_name',
            'minio_path',
            'status',
            'total_rows',
            'imported_rows',
            'error_rows',
            'error_detail',
        ]


class WeekDefinitionSerializer(serializers.ModelSerializer):
    """
    Serializer for WeekDefinition.
    - Computes days_count and working_days server-side via WeekService.
    - Generates standard week_code (w-{YYYY-MM}-{0N}) on creation.
    - Exposes week_code as read-only.
    """
    class Meta:
        model = WeekDefinition
        fields = [
            'id',
            'month',
            'week_no',
            'week_code',
            'week_label',
            'start_date',
            'end_date',
            'days_count',
            'holiday_days',
            'working_days',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'week_code',
            'days_count',
            'working_days',
            'created_at',
            'updated_at',
        ]

    def validate_month(self, value):
        val = value.strip()
        parts = val.split('-')
        if len(parts) != 2 or not parts[0].isdigit() or not parts[1].isdigit():
            raise serializers.ValidationError("Month must be in YYYY-MM format (e.g. 2026-08).")
        month_num = int(parts[1])
        if not (1 <= month_num <= 12):
            raise serializers.ValidationError("Month number must be between 01 and 12.")
        return val

    def validate(self, attrs):
        start_date = attrs.get('start_date') or (self.instance.start_date if self.instance else None)
        end_date = attrs.get('end_date') or (self.instance.end_date if self.instance else None)

        if not start_date or not end_date:
            raise serializers.ValidationError("Both start_date and end_date are required.")

        if end_date < start_date:
            raise serializers.ValidationError({"end_date": "End date cannot be earlier than start date."})

        month = attrs.get('month') or (self.instance.month if self.instance else None)
        week_no = attrs.get('week_no') or (self.instance.week_no if self.instance else None)

        # Holiday days
        holiday_days = attrs.get('holiday_days')
        if holiday_days is None:
            holiday_days = self.instance.holiday_days if self.instance else 0
        if holiday_days < 0:
            raise serializers.ValidationError({"holiday_days": "Holiday days cannot be negative."})

        # Server-side computation of days_count & working_days
        days_count, working_days = WeekService.compute_days(start_date, end_date, holiday_days)
        attrs['days_count'] = days_count
        attrs['working_days'] = working_days

        # Auto-generate week_code on create
        if not self.instance:
            if not week_no:
                raise serializers.ValidationError({"week_no": "week_no is required."})
            attrs['week_code'] = WeekService.generate_week_code(month, week_no)

            # Auto-generate week_label if not provided
            if not attrs.get('week_label'):
                month_short = start_date.strftime('%b')
                attrs['week_label'] = f"Week {week_no} ({start_date.strftime('%d')}-{end_date.strftime('%d')} {month_short})"

        return attrs


class MonthlyPlanSerializer(serializers.ModelSerializer):
    """
    Serializer for MonthlyPlan.
    - weekly_breakdown is exposed as read-only computed field.
    - fg_code must exist in bom_fg_header and start with '7'.
    - Auto-computes weekly_breakdown using ProrateService.prorate(monthly_target, weeks).
    """
    fg_code = serializers.SlugRelatedField(
        slug_field='fg_code',
        queryset=BOMFGHeader.objects.all(),
        source='fg',
        help_text="Finished Good code from bom_fg_header (must start with '7')"
    )
    fg_description = serializers.CharField(source='fg.fg_description', read_only=True)
    customer_name = serializers.CharField(required=False, allow_blank=True, default='')
    month = serializers.CharField(max_length=7)
    monthly_target = serializers.IntegerField(min_value=1)
    uom = serializers.CharField(max_length=20, default='PC', required=False)
    weekly_breakdown = serializers.DictField(read_only=True)
    custom_notes = serializers.CharField(required=False, allow_blank=True, default='')

    class Meta:
        model = MonthlyPlan
        fields = [
            'id',
            'fg_code',
            'fg_description',
            'customer_name',
            'month',
            'monthly_target',
            'uom',
            'weekly_breakdown',
            'custom_notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'fg_description',
            'weekly_breakdown',
            'created_at',
            'updated_at',
        ]

    def validate_month(self, value):
        val = value.strip()
        parts = val.split('-')
        if len(parts) != 2 or not parts[0].isdigit() or not parts[1].isdigit():
            raise serializers.ValidationError("Month must be in YYYY-MM format (e.g. 2026-08).")
        month_num = int(parts[1])
        if not (1 <= month_num <= 12):
            raise serializers.ValidationError("Month number must be between 01 and 12.")
        return val

    def validate(self, attrs):
        # Determine FG
        fg = attrs.get('fg') or (self.instance.fg if self.instance else None)
        if not fg:
            raise serializers.ValidationError({"fg_code": "Finished Good code is required."})

        if not fg.fg_code.startswith('7'):
            raise serializers.ValidationError({"fg_code": "FG code must start with '7'."})

        # Determine Month
        month = attrs.get('month') or (self.instance.month if self.instance else None)
        if not month:
            raise serializers.ValidationError({"month": "Month is required."})

        # Uniqueness check on (fg, month)
        qs = MonthlyPlan.objects.filter(fg=fg, month=month)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                {"non_field_errors": [f"A monthly plan for Finished Good '{fg.fg_code}' in month '{month}' already exists."]}
            )

        # Target check
        monthly_target = attrs.get('monthly_target')
        if monthly_target is None:
            monthly_target = self.instance.monthly_target if self.instance else 0
        if monthly_target <= 0:
            raise serializers.ValidationError({"monthly_target": "Monthly target must be greater than 0."})

        # Fetch week definitions for this month
        weeks = list(WeekDefinition.objects.filter(month=month).order_by('week_no'))
        if not weeks:
            raise serializers.ValidationError(
                {"month": [f"No week definitions configured for month '{month}'. Please configure or auto-generate weeks first."]}
            )

        # Auto-compute weekly_breakdown server-side (never accept from client)
        attrs['weekly_breakdown'] = ProrateService.prorate(monthly_target, weeks)

        # Default customer_name if empty
        if not attrs.get('customer_name') and not (self.instance and self.instance.customer_name):
            if fg.customer_segment:
                attrs['customer_name'] = fg.customer_segment

        return attrs

    def update(self, instance, validated_data):
        # Ensure weekly_breakdown is updated if target or month changed
        return super().update(instance, validated_data)


class MB51TransactionSerializer(serializers.ModelSerializer):
    """
    Serializer for SAP MB51 Material Movement Transactions.
    classification and week_code are read-only computed fields:
    - classification is computed via MB51ClassificationService
    - week_code is computed via WeekMappingService based on posting_date
    """
    classification = serializers.CharField(read_only=True)
    week_code = serializers.CharField(source='week_id', read_only=True, allow_null=True)
    upload_batch_id = serializers.IntegerField(source='upload_batch.id', read_only=True, allow_null=True)

    class Meta:
        model = MB51Transaction
        fields = [
            'id',
            'material_document',
            'posting_date',
            'movement_type',
            'part_number',
            'material_description',
            'quantity',
            'uom',
            'storage_location',
            'plant',
            'vendor_customer',
            'po_order_number',
            'classification',
            'week_code',
            'upload_batch_id',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'classification',
            'week_code',
            'upload_batch_id',
            'created_at',
            'updated_at',
        ]

    def to_internal_value(self, data):
        # Support both snake_case and camelCase input keys
        normalized = data.copy() if hasattr(data, 'copy') else dict(data)
        camel_to_snake = {
            'materialDocument': 'material_document',
            'postingDate': 'posting_date',
            'movementType': 'movement_type',
            'partNumber': 'part_number',
            'materialDescription': 'material_description',
            'storageLocation': 'storage_location',
            'vendorOrCustomer': 'vendor_customer',
            'poOrOrderNumber': 'po_order_number',
        }
        for camel, snake in camel_to_snake.items():
            if camel in normalized and snake not in normalized:
                normalized[snake] = normalized[camel]

        return super().to_internal_value(normalized)

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Transaction quantity must be greater than 0.")
        return value

    def validate(self, attrs):
        movement_type = attrs.get('movement_type') or (self.instance.movement_type if self.instance else '')
        part_number = attrs.get('part_number') or (self.instance.part_number if self.instance else '')
        posting_date = attrs.get('posting_date') or (self.instance.posting_date if self.instance else None)

        # Compute classification server-side
        attrs['classification'] = MB51ClassificationService.classify(movement_type, part_number)

        # Compute week_code server-side
        if posting_date:
            matched_week = WeekMappingService.map_to_week(posting_date)
            attrs['week_id'] = matched_week
        else:
            attrs['week_id'] = None

        return attrs

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        # Frontend camelCase aliases for seamless UI compatibility
        ret['materialDocument'] = instance.material_document
        ret['postingDate'] = instance.posting_date.isoformat() if instance.posting_date else ''
        ret['movementType'] = instance.movement_type
        ret['partNumber'] = instance.part_number
        ret['materialDescription'] = instance.material_description
        ret['storageLocation'] = instance.storage_location
        ret['vendorOrCustomer'] = instance.vendor_customer
        ret['poOrOrderNumber'] = instance.po_order_number
        ret['weekId'] = instance.week_id or ''
        return ret


class StockReportSerializer(serializers.ModelSerializer):
    """
    Serializer for SAP MB52 StockReport model.
    - material_type: read-only computed field derived from part_number prefix
      using MaterialTypeService.derive(part_number)
    - Supports both camelCase and snake_case inputs
    - Exposes camelCase aliases in output for frontend compatibility
    """
    material_type = serializers.CharField(read_only=True)
    total_stock = serializers.DecimalField(max_digits=12, decimal_places=3, read_only=True)
    is_below_safety_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = StockReport
        fields = [
            'id',
            'part_number',
            'material_description',
            'material_type',
            'unrestricted_stock',
            'in_quality_insp',
            'blocked',
            'storage_location',
            'uom',
            'safety_stock',
            'plant',
            'total_stock',
            'is_below_safety_stock',
            'upload_batch_id',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'material_type',
            'total_stock',
            'is_below_safety_stock',
            'upload_batch_id',
            'created_at',
            'updated_at',
        ]

    def to_internal_value(self, data):
        normalized = data.copy() if hasattr(data, 'copy') else dict(data)
        camel_to_snake = {
            'partNumber': 'part_number',
            'materialDescription': 'material_description',
            'materialType': 'material_type',
            'unrestrictedStock': 'unrestricted_stock',
            'inQualityInsp': 'in_quality_insp',
            'storageLocation': 'storage_location',
            'safetyStock': 'safety_stock',
        }
        for camel, snake in camel_to_snake.items():
            if camel in normalized and snake not in normalized:
                normalized[snake] = normalized[camel]

        return super().to_internal_value(normalized)

    def validate_part_number(self, value):
        val = str(value or '').strip()
        if not val:
            raise serializers.ValidationError("Part number cannot be blank.")
        return val

    def validate_unrestricted_stock(self, value):
        if value < 0:
            raise serializers.ValidationError("Unrestricted stock cannot be negative.")
        return value

    def validate_in_quality_insp(self, value):
        if value < 0:
            raise serializers.ValidationError("Quality inspection stock cannot be negative.")
        return value

    def validate_blocked(self, value):
        if value < 0:
            raise serializers.ValidationError("Blocked stock cannot be negative.")
        return value

    def validate_safety_stock(self, value):
        if value < 0:
            raise serializers.ValidationError("Safety stock cannot be negative.")
        return value

    def validate(self, attrs):
        part_number = attrs.get('part_number') or (self.instance.part_number if self.instance else '')
        # Compute material_type read-only from part_number prefix / DB
        attrs['material_type'] = MaterialTypeService.derive(part_number)
        return attrs

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        # Frontend camelCase aliases for seamless UI compatibility
        ret['partNumber'] = instance.part_number
        ret['materialDescription'] = instance.material_description
        ret['materialType'] = instance.material_type
        ret['unrestrictedStock'] = float(instance.unrestricted_stock)
        ret['inQualityInsp'] = float(instance.in_quality_insp)
        ret['blocked'] = float(instance.blocked)
        ret['storageLocation'] = instance.storage_location
        ret['safetyStock'] = float(instance.safety_stock)
        ret['totalStock'] = float(instance.total_stock)
        ret['isBelowSafetyStock'] = instance.is_below_safety_stock
        ret['lastUpdated'] = instance.updated_at.strftime('%Y-%m-%d %H:%M') if instance.updated_at else ''
        return ret





