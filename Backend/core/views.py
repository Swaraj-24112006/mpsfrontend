import csv
import io
import math
from django.conf import settings
from django.db import connection, transaction
from django.db.models import Q
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import (
    BOMFGHeader,
    RMPMComponentMaster,
    BOMMaster,
    VendorSuppliedComponent,
    VendorBuyerMaster,
    UploadBatch
)
from .serializers import (
    BOMFGHeaderSerializer,
    RMPMComponentSerializer,
    BOMMasterSerializer,
    VendorBuyerSerializer
)
from .pagination import StandardResultsSetPagination
from .services import (
    StorageService,
    UploadBatchService,
    BOMService,
    MaterialTypeService
)


@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    """
    Health check probe for gateway and container readiness.
    """
    return Response({
        "status": "healthy",
        "service": "mps_backend",
        "version": "1.0.0"
    })


class BOMFGHeaderListCreateView(generics.ListCreateAPIView):
    """
    GET /api/bom/fg-headers/
    Lists finished good headers with optional filtering:
    - ?is_active=true|false
    - ?mini_factory=MF1
    - ?line=Line 1
    - ?search=7001001 (matches fg_code, fg_description, customer_segment)
    - ?paginate=false (returns full unpaginated list)

    POST /api/bom/fg-headers/
    Creates a new finished good header.
    Validates fg_code starts with '7' and defaults active_bom_version to 'v1'.
    """
    serializer_class = BOMFGHeaderSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [AllowAny] if settings.DEBUG else [IsAuthenticated]

    def get_queryset(self):
        qs = BOMFGHeader.objects.all().order_by('fg_code')

        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            if is_active.lower() in ('true', '1'):
                qs = qs.filter(is_active=True)
            elif is_active.lower() in ('false', '0'):
                qs = qs.filter(is_active=False)

        mini_factory = self.request.query_params.get('mini_factory')
        if mini_factory:
            qs = qs.filter(mini_factory__iexact=mini_factory.strip())

        line = self.request.query_params.get('line')
        if line:
            qs = qs.filter(line__iexact=line.strip())

        search = self.request.query_params.get('search')
        if search:
            query = search.strip()
            qs = qs.filter(
                Q(fg_code__icontains=query) |
                Q(fg_description__icontains=query) |
                Q(customer_segment__icontains=query)
            )

        return qs

    def perform_create(self, serializer):
        # Default active_bom_version = 'v1' if omitted
        if not serializer.validated_data.get('active_bom_version'):
            serializer.validated_data['active_bom_version'] = 'v1'
        serializer.save()


class BOMFGHeaderDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET /api/bom/fg-headers/{fg_code}/
    Retrieves a single finished good header by fg_code.

    PATCH /api/bom/fg-headers/{fg_code}/
    Updates fields on the header.
    If active_bom_version changes, emits a warning in the response.

    DELETE /api/bom/fg-headers/{fg_code}/
    Deletes the finished good header.
    Blocks with HTTP 409 Conflict if active monthly_plan rows reference this fg_code.
    """
    queryset = BOMFGHeader.objects.all()
    serializer_class = BOMFGHeaderSerializer
    lookup_field = 'fg_code'
    permission_classes = [AllowAny] if settings.DEBUG else [IsAuthenticated]

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        old_version = instance.active_bom_version

        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        data = serializer.data
        new_version = serializer.instance.active_bom_version
        if old_version and new_version and old_version != new_version:
            data['warning'] = (
                f"Active BOM version changed from '{old_version}' to '{new_version}'. "
                f"MRP computation and component requirements will reflect the new BOM tree."
            )

        return Response(data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()

        # Block if active monthly_plan rows exist for this fg_code
        has_monthly_plan = False
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT 1 FROM information_schema.tables WHERE table_name = 'monthly_plan'"
                )
                if cursor.fetchone():
                    cursor.execute(
                        "SELECT 1 FROM monthly_plan WHERE fg_code = %s LIMIT 1",
                        [instance.fg_code]
                    )
                    has_monthly_plan = cursor.fetchone() is not None
        except Exception:
            pass

        if has_monthly_plan:
            return Response(
                {
                    "error": (
                        f"Cannot delete Finished Good '{instance.fg_code}' because active "
                        f"monthly plans reference it. Delete or reassign monthly plans first."
                    )
                },
                status=status.HTTP_409_CONFLICT
            )

        fg_code = instance.fg_code
        self.perform_destroy(instance)
        return Response(
            {"message": f"Finished Good '{fg_code}' deleted successfully."},
            status=status.HTTP_200_OK
        )


class ComponentListCreateView(generics.ListCreateAPIView):
    """
    GET /api/components/
    Lists RM/PM components with filters:
    - ?category=RM|PM
    - ?is_common_part=true|false
    - ?is_active=true|false
    - ?search=CASTING (matches component_code, component_description, default_storage_location)
    - ?paginate=false (unpaginated list)

    POST /api/components/
    Creates a new RM/PM component.
    Validates component_code does NOT start with '7' and safety_stock >= 0.
    """
    serializer_class = RMPMComponentSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [AllowAny] if settings.DEBUG else [IsAuthenticated]

    def get_queryset(self):
        qs = RMPMComponentMaster.objects.all().order_by('component_code')

        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category=category.strip().upper())

        is_common_part = self.request.query_params.get('is_common_part')
        if is_common_part is not None:
            if is_common_part.lower() in ('true', '1'):
                qs = qs.filter(is_common_part=True)
            elif is_common_part.lower() in ('false', '0'):
                qs = qs.filter(is_common_part=False)

        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            if is_active.lower() in ('true', '1'):
                qs = qs.filter(is_active=True)
            elif is_active.lower() in ('false', '0'):
                qs = qs.filter(is_active=False)

        search = self.request.query_params.get('search')
        if search:
            query = search.strip()
            qs = qs.filter(
                Q(component_code__icontains=query) |
                Q(component_description__icontains=query) |
                Q(default_storage_location__icontains=query)
            )

        return qs


class ComponentDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET /api/components/{component_code}/
    Retrieves a single component by component_code.

    PATCH /api/components/{component_code}/
    Updates fields on the component. component_code is read-only after create.

    DELETE /api/components/{component_code}/
    Deletes the component.
    Blocks with HTTP 409 Conflict if any bom_master rows reference this component_code.
    """
    queryset = RMPMComponentMaster.objects.all()
    serializer_class = RMPMComponentSerializer
    lookup_field = 'component_code'
    permission_classes = [AllowAny] if settings.DEBUG else [IsAuthenticated]

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()

        # Block with 409 if any bom_master rows reference this component_code
        bom_count = instance.bom_usages.count()
        if bom_count > 0:
            referencing_fgs = list(
                instance.bom_usages.values_list('fg_id', flat=True).distinct()
            )
            return Response(
                {
                    "error": (
                        f"Cannot delete Component '{instance.component_code}' because it is referenced "
                        f"in {bom_count} BOM line(s) for Finished Good(s): {', '.join(referencing_fgs)}. "
                        f"Remove this component from those BOMs before deleting."
                    )
                },
                status=status.HTTP_409_CONFLICT
            )

        code = instance.component_code
        self.perform_destroy(instance)
        return Response(
            {"message": f"Component '{code}' deleted successfully."},
            status=status.HTTP_200_OK
        )


class BOMMasterListCreateView(generics.ListCreateAPIView):
    """
    GET /api/bom/
    Lists BOM lines with filtering:
    - ?fg_code=7001001
    - ?component_code=RM-CASTING-01
    - ?category=RM|PM
    - ?is_active=true|false
    - ?search=... (searches fg_code, fg_description, component_code, component_description)
    - ?paginate=false

    POST /api/bom/
    Creates a BOM line. Validates both FK exist, qty > 0, and updates common part flags.
    """
    serializer_class = BOMMasterSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [AllowAny] if settings.DEBUG else [IsAuthenticated]

    def get_queryset(self):
        qs = BOMMaster.objects.select_related('fg', 'component').all().order_by('fg_id', 'component_id')

        fg_code = self.request.query_params.get('fg_code')
        if fg_code:
            qs = qs.filter(fg_id=fg_code.strip())

        component_code = self.request.query_params.get('component_code')
        if component_code:
            qs = qs.filter(component_id=component_code.strip().upper())

        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(component__category=category.strip().upper())

        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            if is_active.lower() in ('true', '1'):
                qs = qs.filter(is_active=True)
            elif is_active.lower() in ('false', '0'):
                qs = qs.filter(is_active=False)

        search = self.request.query_params.get('search')
        if search:
            query = search.strip()
            qs = qs.filter(
                Q(fg_id__icontains=query) |
                Q(fg__fg_description__icontains=query) |
                Q(component_id__icontains=query) |
                Q(component__component_description__icontains=query)
            )

        return qs

    def perform_create(self, serializer):
        instance = serializer.save()
        from core.services.bom_service import BOMService
        BOMService.update_common_part_flags(instance.component_id)


class BOMMasterDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET /api/bom/{id}/
    Retrieves a single BOM item.

    PATCH /api/bom/{id}/
    Updates fields on a BOM item. Re-runs common part flags if component or qty changes.

    DELETE /api/bom/{id}/
    Hard deletes the BOM line and triggers update_common_part_flags.
    """
    queryset = BOMMaster.objects.select_related('fg', 'component').all()
    serializer_class = BOMMasterSerializer
    permission_classes = [AllowAny] if settings.DEBUG else [IsAuthenticated]

    def perform_update(self, serializer):
        old_component_id = serializer.instance.component_id
        instance = serializer.save()
        from core.services.bom_service import BOMService
        BOMService.update_common_part_flags(instance.component_id)
        if old_component_id and old_component_id != instance.component_id:
            BOMService.update_common_part_flags(old_component_id)

    def perform_destroy(self, instance):
        component_id = instance.component_id
        instance.delete()
        from core.services.bom_service import BOMService
        BOMService.update_common_part_flags(component_id)


class ExplodedBOMView(APIView):
    """
    GET /api/bom/exploded/{fg_code}/
    Joins bom_master -> rm_pm_component_master -> vendor_supplied_components -> vendor_buyer_master -> stock_report.
    Returns full component tree with:
    - current_stock
    - stock_covers_units (floor(current_stock / bom_qty))
    - vendor_name, buyer_name, lead_time_days
    - is_common_part, shared_in_fgs_count
    """
    permission_classes = [AllowAny] if settings.DEBUG else [IsAuthenticated]

    def get(self, request, fg_code):
        clean_code = fg_code.strip()
        fg = BOMFGHeader.objects.filter(fg_code=clean_code).first()
        if not fg:
            return Response(
                {"error": f"Finished Good '{clean_code}' not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Query all active BOM lines for the active BOM version
        version = request.query_params.get('bom_version') or fg.active_bom_version
        bom_lines = BOMMaster.objects.filter(
            fg=fg,
            bom_version=version,
            is_active=True
        ).select_related('component').order_by('component__category', 'component_id')

        # Check if stock_report table exists
        stock_map = {}
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT 1 FROM information_schema.tables WHERE table_name = 'stock_report'"
                )
                if cursor.fetchone():
                    comp_codes = [b.component_id for b in bom_lines]
                    if comp_codes:
                        placeholders = ','.join(['%s'] * len(comp_codes))
                        cursor.execute(
                            f"SELECT component_code, unrestricted_stock FROM stock_report WHERE component_code IN ({placeholders})",
                            comp_codes
                        )
                        for row in cursor.fetchall():
                            stock_map[row[0]] = float(row[1])
        except Exception:
            pass

        # Query vendor and buyer mappings for components
        comp_codes = [b.component_id for b in bom_lines]
        vendor_rels = VendorSuppliedComponent.objects.filter(
            component_id__in=comp_codes
        ).select_related('vendor_buyer')

        vendor_map = {}
        for rel in vendor_rels:
            if rel.component_id not in vendor_map:
                vb = rel.vendor_buyer
                vendor_map[rel.component_id] = {
                    'vendor_code': vb.vendor_code,
                    'vendor_name': vb.vendor_name,
                    'buyer_name': vb.buyer_name,
                    'lead_time_days': vb.lead_time_days,
                }

        exploded_components = []
        for line in bom_lines:
            comp = line.component
            current_stock = stock_map.get(comp.component_code, 0.0)
            qty = float(line.qty)
            stock_covers = math.floor(current_stock / qty) if qty > 0 else 0

            v_info = vendor_map.get(comp.component_code, {
                'vendor_code': None,
                'vendor_name': 'No Vendor Assigned',
                'buyer_name': 'Unassigned',
                'lead_time_days': line.lead_time_days_override or 7
            })

            exploded_components.append({
                'id': line.id,
                'fg_code': fg.fg_code,
                'fg_description': fg.fg_description,
                'component_code': comp.component_code,
                'component_description': comp.component_description,
                'category': comp.category,
                'uom': line.uom or comp.uom,
                'qty': qty,
                'component_role': line.component_role,
                'bom_version': line.bom_version,
                'is_active': line.is_active,
                'is_common_part': comp.is_common_part,
                'shared_in_fgs_count': comp.shared_in_fgs_count,
                'current_stock': current_stock,
                'stock_covers_units': stock_covers,
                'vendor_code': v_info.get('vendor_code'),
                'vendor_name': v_info.get('vendor_name'),
                'buyer_name': v_info.get('buyer_name'),
                'lead_time_days': line.lead_time_days_override or v_info.get('lead_time_days', 7),
            })

        return Response({
            'fg_code': fg.fg_code,
            'fg_description': fg.fg_description,
            'active_bom_version': version,
            'components_count': len(exploded_components),
            'components': exploded_components
        })


class CommonComponentsView(APIView):
    """
    GET /api/bom/common-components/
    Queries rm_pm_component_master WHERE is_common_part = TRUE.
    Annotates with list of active consuming Finished Goods.
    """
    permission_classes = [AllowAny] if settings.DEBUG else [IsAuthenticated]

    def get(self, request):
        qs = RMPMComponentMaster.objects.filter(
            is_common_part=True,
            is_active=True
        ).prefetch_related('bom_usages__fg').order_by('component_code')

        results = []
        for comp in qs:
            consuming_fgs = []
            seen_fgs = set()
            for usage in comp.bom_usages.filter(is_active=True):
                if usage.fg_id not in seen_fgs:
                    seen_fgs.add(usage.fg_id)
                    consuming_fgs.append({
                        'fg_code': usage.fg_id,
                        'fg_description': usage.fg.fg_description if usage.fg else '',
                        'qty': float(usage.qty),
                        'uom': usage.uom,
                        'bom_version': usage.bom_version,
                    })

            results.append({
                'component_code': comp.component_code,
                'component_description': comp.component_description,
                'category': comp.category,
                'uom': comp.uom,
                'safety_stock': float(comp.safety_stock),
                'shared_in_fgs_count': comp.shared_in_fgs_count,
                'consuming_fgs_count': len(consuming_fgs),
                'consuming_fgs': consuming_fgs,
            })

        return Response({
            'count': len(results),
            'results': results
        })


class VendorBuyerListCreateView(generics.ListCreateAPIView):
    """
    GET /api/vendor-buyers/
    Lists vendor and buyer relationships with optional filters:
    - ?buyer_name=Rajesh
    - ?category=RM|PM
    - ?vendor_code=V-1001
    - ?search=... (searches vendor_code, vendor_name, buyer_name, city, gst_no)
    - ?paginate=false (unpaginated list)

    POST /api/vendor-buyers/
    Inserts vendor_buyer_master and bulk inserts vendor_supplied_components rows
    from the supplied_components array.
    """
    serializer_class = VendorBuyerSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [AllowAny] if settings.DEBUG else [IsAuthenticated]

    def get_queryset(self):
        qs = VendorBuyerMaster.objects.prefetch_related('supplied_components_rel').all().order_by('vendor_code')

        buyer_name = self.request.query_params.get('buyer_name')
        if buyer_name:
            qs = qs.filter(buyer_name__icontains=buyer_name.strip())

        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category=category.strip().upper())

        vendor_code = self.request.query_params.get('vendor_code')
        if vendor_code:
            qs = qs.filter(vendor_code__iexact=vendor_code.strip())

        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            if is_active.lower() in ('true', '1'):
                qs = qs.filter(is_active=True)
            elif is_active.lower() in ('false', '0'):
                qs = qs.filter(is_active=False)

        search = self.request.query_params.get('search')
        if search:
            query = search.strip()
            qs = qs.filter(
                Q(vendor_code__icontains=query) |
                Q(vendor_name__icontains=query) |
                Q(buyer_name__icontains=query) |
                Q(city__icontains=query) |
                Q(gst_no__icontains=query)
            )

        return qs


class VendorBuyerDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET /api/vendor-buyers/{id}/
    Retrieves a single vendor-buyer master entry with supplied_components.

    PATCH /api/vendor-buyers/{id}/
    Updates fields on the vendor. If supplied_components is provided,
    deletes all existing junction rows for this vendor and inserts the fresh list.

    DELETE /api/vendor-buyers/{id}/
    Deletes the vendor. Blocks with HTTP 409 Conflict if active vendor_delivery_schedule rows reference this vendor_code.
    """
    queryset = VendorBuyerMaster.objects.prefetch_related('supplied_components_rel').all()
    serializer_class = VendorBuyerSerializer
    permission_classes = [AllowAny] if settings.DEBUG else [IsAuthenticated]

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()

        # Block with 409 if active vendor_delivery_schedule rows reference vendor_code
        has_active_schedules = False
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT 1 FROM information_schema.tables WHERE table_name = 'vendor_delivery_schedule'"
                )
                if cursor.fetchone():
                    cursor.execute(
                        "SELECT 1 FROM vendor_delivery_schedule WHERE vendor_code = %s AND delivery_status != 'CANCELLED' LIMIT 1",
                        [instance.vendor_code]
                    )
                    has_active_schedules = cursor.fetchone() is not None
        except Exception:
            pass

        if has_active_schedules:
            return Response(
                {
                    "error": (
                        f"Cannot delete Vendor '{instance.vendor_code}' because active "
                        f"delivery schedule commitments reference it. Cancel or reassign those schedules first."
                    )
                },
                status=status.HTTP_409_CONFLICT
            )

        code = instance.vendor_code
        self.perform_destroy(instance)
        return Response(
            {"message": f"Vendor '{code}' deleted successfully."},
            status=status.HTTP_200_OK
        )


class BOMCSVUploadView(APIView):
    """
    POST /api/bom/upload-csv/
    Accepts CSV file upload for BOM Master.
    Expected CSV columns:
    FG Code | FG Description | Component Code | Component Description | Quantity Per Unit | UOM | Category

    Automatically creates/updates:
    1. bom_fg_header (from FG Code and Description)
    2. rm_pm_component_master (from Component Code, Description, Category, UOM)
    3. bom_master line linking them
    4. Triggers BOMService.update_common_part_flags to recalculate shared component metrics.
    """
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    permission_classes = [AllowAny] if settings.DEBUG else [IsAuthenticated]

    def post(self, request):
        file_obj = request.FILES.get('file')
        if not file_obj:
            csv_content = request.data.get('csv_content')
            if csv_content:
                file_obj = io.BytesIO(csv_content.encode('utf-8'))
                file_name = "direct_bom_upload.csv"
            else:
                return Response(
                    {"error": "No file uploaded. Please provide a CSV file in 'file' multipart field."},
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            file_name = file_obj.name

        if not file_name.lower().endswith('.csv'):
            return Response(
                {"error": "Invalid file format. Only .csv files are supported."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Upload file to MinIO / Local storage
        try:
            minio_path = StorageService.upload_file(file_obj, f"bom_uploads/{file_name}")
        except Exception:
            minio_path = f"fallback/{file_name}"

        # Initialize upload batch audit record
        username = request.user.username if request.user and request.user.is_authenticated else 'system'
        batch = UploadBatchService.create_batch(
            upload_type='BOM_UPLOAD',
            user=username,
            file_name=file_name,
            minio_path=minio_path,
            total_rows=0
        )

        try:
            # Read and decode CSV
            file_obj.seek(0)
            raw_text = file_obj.read().decode('utf-8-sig', errors='replace')
            reader = csv.reader(io.StringIO(raw_text))

            rows = [r for r in reader if any(cell.strip() for cell in r)]
            if not rows:
                UploadBatchService.fail(batch, "CSV file is empty.")
                return Response({"error": "CSV file contains no data."}, status=status.HTTP_400_BAD_REQUEST)

            # Map headers
            raw_headers = rows[0]
            header_map = {}
            for idx, h in enumerate(raw_headers):
                clean = h.strip().lower().replace(' ', '_').replace('-', '_').replace('*', '')
                if clean in ('fg_code', 'fgcode', 'finished_good_code', 'finished_good', 'fg'):
                    header_map['fg_code'] = idx
                elif clean in ('fg_description', 'fgdescription', 'finished_good_description', 'fg_desc'):
                    header_map['fg_description'] = idx
                elif clean in ('component_code', 'componentcode', 'part_number', 'part_no', 'component'):
                    header_map['component_code'] = idx
                elif clean in ('component_description', 'componentdescription', 'part_description', 'comp_desc'):
                    header_map['component_description'] = idx
                elif clean in ('quantity_per_unit', 'quantity', 'qty', 'qty_per_unit', 'usage'):
                    header_map['qty'] = idx
                elif clean in ('uom', 'unit', 'unit_of_measure'):
                    header_map['uom'] = idx
                elif clean in ('category', 'material_type', 'type'):
                    header_map['category'] = idx

            # Ensure minimal required columns exist
            if 'fg_code' not in header_map or 'component_code' not in header_map or 'qty' not in header_map:
                msg = (
                    "Missing required columns in CSV header. Must contain at least: "
                    "'FG Code', 'Component Code', and 'Quantity Per Unit' (or 'Qty')."
                )
                UploadBatchService.fail(batch, msg)
                return Response({"error": msg}, status=status.HTTP_400_BAD_REQUEST)

            data_rows = rows[1:]
            batch.total_rows = len(data_rows)
            batch.save(update_fields=['total_rows'])

            imported_count = 0
            errors = []
            touched_components = set()
            fgs_seen = set()
            comps_seen = set()

            for row_idx, row in enumerate(data_rows, start=2):
                def get_val(key, default=''):
                    idx = header_map.get(key)
                    if idx is not None and idx < len(row):
                        return row[idx].strip()
                    return default

                raw_fg = get_val('fg_code')
                raw_comp = get_val('component_code')
                raw_qty = get_val('qty')

                if not raw_fg or not raw_comp or not raw_qty:
                    errors.append(f"Row {row_idx}: Missing FG Code, Component Code, or Quantity.")
                    continue

                fg_code = raw_fg.upper()
                comp_code = raw_comp.upper()

                # Validate FG starts with '7'
                if not fg_code.startswith('7'):
                    errors.append(f"Row {row_idx}: FG Code '{fg_code}' must start with '7'.")
                    continue

                # Validate Component does NOT start with '7'
                if comp_code.startswith('7'):
                    errors.append(f"Row {row_idx}: Component Code '{comp_code}' cannot start with '7'.")
                    continue

                # Parse Quantity
                try:
                    qty = float(raw_qty)
                    if qty <= 0:
                        errors.append(f"Row {row_idx}: Quantity must be greater than 0.")
                        continue
                except ValueError:
                    errors.append(f"Row {row_idx}: Invalid quantity value '{raw_qty}'.")
                    continue

                fg_desc = get_val('fg_description', f"Finished Good {fg_code}")
                comp_desc = get_val('component_description', f"Component {comp_code}")
                uom = get_val('uom', 'PC').upper() or 'PC'

                raw_cat = get_val('category', '').upper()
                if raw_cat in ('RM', 'PM'):
                    category = raw_cat
                else:
                    category = MaterialTypeService.derive(comp_code)
                    if category not in ('RM', 'PM'):
                        category = 'RM'

                try:
                    with transaction.atomic():
                        # 1. Upsert FG Header
                        fg_obj, _ = BOMFGHeader.objects.update_or_create(
                            fg_code=fg_code,
                            defaults={
                                'fg_description': fg_desc,
                                'uom': uom,
                                'is_active': True,
                            }
                        )
                        fgs_seen.add(fg_code)

                        # 2. Upsert RM/PM Component Master
                        comp_obj, _ = RMPMComponentMaster.objects.update_or_create(
                            component_code=comp_code,
                            defaults={
                                'component_description': comp_desc,
                                'category': category,
                                'uom': uom,
                                'is_active': True,
                            }
                        )
                        comps_seen.add(comp_code)

                        # 3. Upsert BOM Master Line
                        BOMMaster.objects.update_or_create(
                            fg=fg_obj,
                            component=comp_obj,
                            bom_version='v1',
                            defaults={
                                'qty': qty,
                                'uom': uom,
                                'is_active': True,
                            }
                        )
                        touched_components.add(comp_code)
                        imported_count += 1

                except Exception as ex:
                    errors.append(f"Row {row_idx}: Database error: {str(ex)}")

            # Recalculate common part flags for all touched components
            for code in touched_components:
                try:
                    BOMService.update_common_part_flags(code)
                except Exception:
                    pass

            # Mark batch status
            error_count = len(errors)
            if error_count == 0:
                UploadBatchService.complete(batch, imported_count, 0, {})
            elif imported_count > 0:
                UploadBatchService.complete(batch, imported_count, error_count, {"errors": errors[:50]})
            else:
                UploadBatchService.fail(batch, f"All {error_count} rows failed validation.")

            return Response({
                "batch_id": batch.id,
                "total_rows": len(data_rows),
                "imported_rows": imported_count,
                "error_rows": error_count,
                "errors": errors[:50],
                "created_fgs_count": len(fgs_seen),
                "created_components_count": len(comps_seen),
                "message": (
                    f"Successfully imported {imported_count} BOM line(s). "
                    f"Updated {len(fgs_seen)} Finished Goods and {len(comps_seen)} Components."
                )
            }, status=status.HTTP_200_OK)

        except Exception as ex:
            UploadBatchService.fail(batch, str(ex))
            return Response(
                {"error": f"Failed to process CSV file: {str(ex)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class VendorBuyerCSVUploadView(APIView):
    """
    POST /api/vendor-buyers/upload-csv/
    Accepts CSV file upload for Vendor & Buyer Master.
    Expected CSV columns:
    Vendor Code | Vendor Name | Buyer Name | Buyer Email | Buyer Phone | Category | Lead Time (Days) | City | GST No | Supplied Component Codes
    """
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    permission_classes = [AllowAny] if settings.DEBUG else [IsAuthenticated]

    def post(self, request):
        file_obj = request.FILES.get('file')
        if not file_obj:
            csv_content = request.data.get('csv_content')
            if csv_content:
                file_obj = io.BytesIO(csv_content.encode('utf-8'))
                file_name = "direct_vendor_upload.csv"
            else:
                return Response(
                    {"error": "No file uploaded. Please provide a CSV file in 'file' multipart field."},
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            file_name = file_obj.name

        if not file_name.lower().endswith('.csv'):
            return Response(
                {"error": "Invalid file format. Only .csv files are supported."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            minio_path = StorageService.upload_file(file_obj, f"vendor_uploads/{file_name}")
        except Exception:
            minio_path = f"fallback/{file_name}"

        username = request.user.username if request.user and request.user.is_authenticated else 'system'
        batch = UploadBatchService.create_batch(
            upload_type='OTHER',
            user=username,
            file_name=file_name,
            minio_path=minio_path,
            total_rows=0
        )

        try:
            file_obj.seek(0)
            raw_text = file_obj.read().decode('utf-8-sig', errors='replace')
            reader = csv.reader(io.StringIO(raw_text))

            rows = [r for r in reader if any(cell.strip() for cell in r)]
            if not rows:
                UploadBatchService.fail(batch, "CSV file is empty.")
                return Response({"error": "CSV file contains no data."}, status=status.HTTP_400_BAD_REQUEST)

            raw_headers = rows[0]
            header_map = {}
            for idx, h in enumerate(raw_headers):
                clean = h.strip().lower().replace(' ', '_').replace('-', '_').replace('*', '')
                if clean in ('vendor_code', 'vendorcode', 'vendor_id', 'supplier_code'):
                    header_map['vendor_code'] = idx
                elif clean in ('vendor_name', 'vendorname', 'supplier_name', 'supplier'):
                    header_map['vendor_name'] = idx
                elif clean in ('buyer_name', 'buyername', 'buyer', 'planner'):
                    header_map['buyer_name'] = idx
                elif clean in ('buyer_email', 'buyeremail', 'email'):
                    header_map['buyer_email'] = idx
                elif clean in ('buyer_phone', 'buyerphone', 'phone', 'mobile'):
                    header_map['buyer_phone'] = idx
                elif clean in ('category', 'material_type', 'type'):
                    header_map['category'] = idx
                elif clean in ('lead_time_days', 'lead_time', 'leadtimedays', 'days'):
                    header_map['lead_time_days'] = idx
                elif clean in ('city', 'location', 'plant_location'):
                    header_map['city'] = idx
                elif clean in ('gst_no', 'gst', 'gstin'):
                    header_map['gst_no'] = idx
                elif clean in ('supplied_components', 'supplied_component_codes', 'components', 'part_codes', 'parts'):
                    header_map['supplied_components'] = idx

            if 'vendor_code' not in header_map or 'vendor_name' not in header_map or 'buyer_name' not in header_map:
                msg = (
                    "Missing required columns in CSV header. Must contain at least: "
                    "'Vendor Code', 'Vendor Name', and 'Buyer Name'."
                )
                UploadBatchService.fail(batch, msg)
                return Response({"error": msg}, status=status.HTTP_400_BAD_REQUEST)

            data_rows = rows[1:]
            batch.total_rows = len(data_rows)
            batch.save(update_fields=['total_rows'])

            imported_count = 0
            errors = []

            for row_idx, row in enumerate(data_rows, start=2):
                def get_val(key, default=''):
                    idx = header_map.get(key)
                    if idx is not None and idx < len(row):
                        return row[idx].strip()
                    return default

                v_code = get_val('vendor_code').upper()
                v_name = get_val('vendor_name')
                b_name = get_val('buyer_name')

                if not v_code or not v_name or not b_name:
                    errors.append(f"Row {row_idx}: Vendor Code, Vendor Name, and Buyer Name are required.")
                    continue

                b_email = get_val('buyer_email')
                b_phone = get_val('buyer_phone')
                city = get_val('city')
                gst_no = get_val('gst_no')
                cat = get_val('category', 'RM').upper()
                category = cat if cat in ('RM', 'PM') else 'RM'

                raw_lt = get_val('lead_time_days', '7')
                try:
                    lead_time = max(1, int(raw_lt))
                except ValueError:
                    lead_time = 7

                # Parse supplied component codes
                raw_parts = get_val('supplied_components', '')
                codes = []
                if raw_parts:
                    for part in raw_parts.replace(';', ',').split(','):
                        clean_part = part.strip().upper()
                        if clean_part and clean_part not in codes:
                            codes.append(clean_part)

                try:
                    with transaction.atomic():
                        vb_obj, _ = VendorBuyerMaster.objects.update_or_create(
                            vendor_code=v_code,
                            defaults={
                                'vendor_name': v_name,
                                'buyer_name': b_name,
                                'buyer_email': b_email,
                                'buyer_phone': b_phone,
                                'category': category,
                                'lead_time_days': lead_time,
                                'city': city,
                                'gst_no': gst_no,
                                'is_active': True,
                            }
                        )

                        # Re-sync junction components
                        if codes:
                            vb_obj.supplied_components_rel.all().delete()
                            junction_objs = []
                            for c in codes:
                                # Ensure component exists in RMPMComponentMaster
                                comp_obj, _ = RMPMComponentMaster.objects.get_or_create(
                                    component_code=c,
                                    defaults={
                                        'component_description': f"Part {c}",
                                        'category': category,
                                        'uom': 'PC',
                                        'is_active': True,
                                    }
                                )
                                junction_objs.append(
                                    VendorSuppliedComponent(vendor_buyer=vb_obj, component=comp_obj)
                                )
                            VendorSuppliedComponent.objects.bulk_create(junction_objs)

                        imported_count += 1

                except Exception as ex:
                    errors.append(f"Row {row_idx}: Database error: {str(ex)}")

            error_count = len(errors)
            if error_count == 0:
                UploadBatchService.complete(batch, imported_count, 0, {})
            elif imported_count > 0:
                UploadBatchService.complete(batch, imported_count, error_count, {"errors": errors[:50]})
            else:
                UploadBatchService.fail(batch, f"All {error_count} rows failed validation.")

            return Response({
                "batch_id": batch.id,
                "total_rows": len(data_rows),
                "imported_rows": imported_count,
                "error_rows": error_count,
                "errors": errors[:50],
                "message": f"Successfully imported {imported_count} Vendor & Buyer relationship(s)."
            }, status=status.HTTP_200_OK)

        except Exception as ex:
            UploadBatchService.fail(batch, str(ex))
            return Response(
                {"error": f"Failed to process Vendor CSV file: {str(ex)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )




