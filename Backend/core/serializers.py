from django.db import transaction
from rest_framework import serializers
from .models import (
    RMPMComponentMaster,
    BOMFGHeader,
    BOMMaster,
    VendorBuyerMaster,
    VendorSuppliedComponent,
    UploadBatch
)


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

