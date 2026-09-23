from django.core.management.base import BaseCommand
from django.db import transaction
from core.models import (
    BOMFGHeader,
    RMPMComponentMaster,
    BOMMaster,
    VendorBuyerMaster,
    VendorSuppliedComponent
)
from core.services.bom_service import BOMService


class Command(BaseCommand):
    help = "Seed initial Finished Goods, Components, BOMs, and Vendor-Buyer mappings"

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write("Seeding Master Data...")

        # 1. Finished Goods Headers
        fgs = [
            {
                'fg_code': '7.06496.03.0',
                'fg_description': 'Vacuum Pump Panther 2.0L',
                'mini_factory': 'Pumps_Division',
                'line': 'A-PMP2',
                'customer_segment': 'OEM',
                'unit_price_inr': 3450.00,
                'active_bom_version': 'v1',
                'uom': 'PC',
                'is_active': True,
            },
            {
                'fg_code': '7.09629.01.0',
                'fg_description': 'FAM B Tandem Vacuum Pump',
                'mini_factory': 'Pumps_Division',
                'line': 'A-PMP1',
                'customer_segment': 'OEM',
                'unit_price_inr': 4120.00,
                'active_bom_version': 'v1',
                'uom': 'PC',
                'is_active': True,
            },
            {
                'fg_code': '7.02551.11.0',
                'fg_description': 'Variable Flow Oil Pump (Gen 3)',
                'mini_factory': 'Pumps_Division',
                'line': 'A-OIL2',
                'customer_segment': 'OEM',
                'unit_price_inr': 2890.00,
                'active_bom_version': 'v1',
                'uom': 'PC',
                'is_active': True,
            },
        ]

        for fg_data in fgs:
            fg, created = BOMFGHeader.objects.update_or_create(
                fg_code=fg_data['fg_code'],
                defaults=fg_data
            )
            self.stdout.write(f"  {'Created' if created else 'Updated'} FG: {fg.fg_code}")

        # 2. Components
        components = [
            {
                'component_code': '100201',
                'component_description': 'Die-Cast Aluminum Housing (Panther)',
                'category': 'RM',
                'uom': 'PC',
                'default_storage_location': 'SL01',
                'safety_stock': 150,
                'is_critical': True,
            },
            {
                'component_code': '100202',
                'component_description': 'Precision Rotor Assembly 40mm',
                'category': 'RM',
                'uom': 'PC',
                'default_storage_location': 'SL01',
                'safety_stock': 200,
                'is_critical': True,
            },
            {
                'component_code': '200405',
                'component_description': 'Composite Carbon Sliding Vane (3-Set)',
                'category': 'RM',
                'uom': 'SET',
                'default_storage_location': 'SL02',
                'safety_stock': 100,
                'is_critical': False,
            },
            {
                'component_code': '200408',
                'component_description': 'Fluorosilicone Shaft Oil Seal 22x35x7',
                'category': 'RM',
                'uom': 'PC',
                'default_storage_location': 'SL02',
                'safety_stock': 300,
                'is_critical': True,
            },
            {
                'component_code': '800101',
                'component_description': 'VCI Anti-Corrosion Liner Bag',
                'category': 'PM',
                'uom': 'PC',
                'default_storage_location': 'SL03',
                'safety_stock': 500,
                'is_critical': False,
            },
            {
                'component_code': '800102',
                'component_description': 'Modular Corrugated Box (Pack of 16)',
                'category': 'PM',
                'uom': 'PC',
                'default_storage_location': 'SL03',
                'safety_stock': 50,
                'is_critical': False,
            },
            {
                'component_code': '100301',
                'component_description': 'Stator Housing Machined (FAM B)',
                'category': 'RM',
                'uom': 'PC',
                'default_storage_location': 'SL01',
                'safety_stock': 120,
                'is_critical': True,
            },
            {
                'component_code': '300105',
                'component_description': 'Torx Flange Bolt M6x30 Grade 10.9',
                'category': 'RM',
                'uom': 'PC',
                'default_storage_location': 'SL02',
                'safety_stock': 1000,
                'is_critical': False,
            },
            {
                'component_code': '100401',
                'component_description': 'Oil Pump Pressure Die Cast Body',
                'category': 'RM',
                'uom': 'PC',
                'default_storage_location': 'SL01',
                'safety_stock': 80,
                'is_critical': True,
            },
            {
                'component_code': '100402',
                'component_description': 'Sintered Inner & Outer Gerotor Set',
                'category': 'RM',
                'uom': 'SET',
                'default_storage_location': 'SL01',
                'safety_stock': 160,
                'is_critical': True,
            },
            {
                'component_code': '200409',
                'component_description': 'HNBR High-Temp O-Ring 58x2.5',
                'category': 'RM',
                'uom': 'PC',
                'default_storage_location': 'SL02',
                'safety_stock': 400,
                'is_critical': False,
            },
            {
                'component_code': '800103',
                'component_description': 'Heavy-Duty Corrugated Bulk Shipper',
                'category': 'PM',
                'uom': 'PC',
                'default_storage_location': 'SL03',
                'safety_stock': 40,
                'is_critical': False,
            },
        ]

        for comp_data in components:
            comp, created = RMPMComponentMaster.objects.update_or_create(
                component_code=comp_data['component_code'],
                defaults=comp_data
            )
            self.stdout.write(f"  {'Created' if created else 'Updated'} Component: {comp.component_code}")

        # 3. BOM Master Lines
        bom_lines = [
            # Panther
            ('7.06496.03.0', '100201', 1.0, 'PC', 'Primary Housing'),
            ('7.06496.03.0', '100202', 1.0, 'PC', 'Rotor'),
            ('7.06496.03.0', '200405', 1.0, 'SET', 'Vane Set'),
            ('7.06496.03.0', '200408', 1.0, 'PC', 'Oil Seal'),
            ('7.06496.03.0', '800101', 1.0, 'PC', 'Liner'),
            ('7.06496.03.0', '800102', 0.0625, 'PC', 'Packaging Box'),
            # FAM B
            ('7.09629.01.0', '100301', 1.0, 'PC', 'Stator Housing'),
            ('7.09629.01.0', '100202', 1.0, 'PC', 'Rotor'),
            ('7.09629.01.0', '300105', 4.0, 'PC', 'Bolts'),
            ('7.09629.01.0', '800101', 1.0, 'PC', 'Liner'),
            # Variable Oil
            ('7.02551.11.0', '100401', 1.0, 'PC', 'Cast Body'),
            ('7.02551.11.0', '100402', 1.0, 'SET', 'Gerotor Set'),
            ('7.02551.11.0', '200409', 2.0, 'PC', 'O-Rings'),
            ('7.02551.11.0', '800103', 0.05, 'PC', 'Bulk Shipper'),
        ]

        for fg_code, comp_code, qty, uom, role in bom_lines:
            fg_obj = BOMFGHeader.objects.get(fg_code=fg_code)
            comp_obj = RMPMComponentMaster.objects.get(component_code=comp_code)
            bom, created = BOMMaster.objects.update_or_create(
                fg=fg_obj,
                component=comp_obj,
                bom_version='v1',
                defaults={
                    'qty': qty,
                    'uom': uom,
                    'component_role': role,
                    'is_active': True,
                }
            )
            BOMService.update_common_part_flags(comp_code)
            self.stdout.write(f"  {'Created' if created else 'Updated'} BOM line: {fg_code} -> {comp_code}")

        # 4. Vendor-Buyer Master
        vendors = [
            {
                'vendor_code': 'V-1001',
                'vendor_name': 'Endurance Technologies Ltd',
                'buyer_name': 'Rajesh Kumar (Buyer - Castings)',
                'buyer_email': 'rajesh.k@autoparts.com',
                'buyer_phone': '+91 98450 11223',
                'category': 'RM',
                'lead_time_days': 7,
                'city': 'Pune, Maharashtra',
                'gst_no': '27AAACE1234F1Z5',
                'components': ['100201', '100301', '100401'],
            },
            {
                'vendor_code': 'V-1002',
                'vendor_name': 'Sundaram Fasteners Ltd',
                'buyer_name': 'Amit Patel (Buyer - Machined & Fasteners)',
                'buyer_email': 'amit.p@autoparts.com',
                'buyer_phone': '+91 98200 44556',
                'category': 'RM',
                'lead_time_days': 4,
                'city': 'Chennai, Tamil Nadu',
                'gst_no': '33AAACS5678G1Z2',
                'components': ['100202', '300105'],
            },
            {
                'vendor_code': 'V-1003',
                'vendor_name': 'Freudenberg NOK Sealing Technologies',
                'buyer_name': 'Priya Sharma (Buyer - Polymers & Seals)',
                'buyer_email': 'priya.s@autoparts.com',
                'buyer_phone': '+91 98330 77889',
                'category': 'RM',
                'lead_time_days': 10,
                'city': 'Gurgaon, Haryana',
                'gst_no': '06AAACF9012H1Z8',
                'components': ['200408', '200409'],
            },
            {
                'vendor_code': 'V-1004',
                'vendor_name': 'Schunk Carbon Technology',
                'buyer_name': 'Rajesh Kumar (Buyer - Castings)',
                'buyer_email': 'rajesh.k@autoparts.com',
                'buyer_phone': '+91 98450 11223',
                'category': 'RM',
                'lead_time_days': 14,
                'city': 'Bengaluru, Karnataka',
                'gst_no': '29AAACS3456J1Z1',
                'components': ['200405'],
            },
            {
                'vendor_code': 'V-1005',
                'vendor_name': 'GKN Sinter Metals',
                'buyer_name': 'Amit Patel (Buyer - Machined & Fasteners)',
                'buyer_email': 'amit.p@autoparts.com',
                'buyer_phone': '+91 98200 44556',
                'category': 'RM',
                'lead_time_days': 8,
                'city': 'Pune, Maharashtra',
                'gst_no': '27AAACG7890K1Z4',
                'components': ['100402'],
            },
            {
                'vendor_code': 'V-2001',
                'vendor_name': 'Supreme Packaging Solutions',
                'buyer_name': 'Vikram Malhotra (Buyer - Packaging)',
                'buyer_email': 'vikram.m@autoparts.com',
                'buyer_phone': '+91 98110 99887',
                'category': 'PM',
                'lead_time_days': 3,
                'city': 'Manesar, Haryana',
                'gst_no': '06AAACS1122L1Z7',
                'components': ['800101', '800102', '800103'],
            },
        ]

        for v_data in vendors:
            comps = v_data.pop('components')
            vb, created = VendorBuyerMaster.objects.update_or_create(
                vendor_code=v_data['vendor_code'],
                defaults=v_data
            )
            # Recreate supplied components
            vb.supplied_components_rel.all().delete()
            junctions = [
                VendorSuppliedComponent(vendor_buyer=vb, component_id=code)
                for code in comps
            ]
            VendorSuppliedComponent.objects.bulk_create(junctions)
            self.stdout.write(f"  {'Created' if created else 'Updated'} Vendor: {vb.vendor_code} with {len(comps)} parts")

        self.stdout.write(self.style.SUCCESS("Master Data seeded successfully!"))
