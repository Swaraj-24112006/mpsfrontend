from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from core.models import (
    BOMFGHeader,
    RMPMComponentMaster,
    BOMMaster,
    VendorBuyerMaster,
    VendorSuppliedComponent,
)


class MasterDataAPITests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testplanner', password='password123')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        # Components
        self.comp_rm1 = RMPMComponentMaster.objects.create(
            component_code='RM-CAST-01',
            component_description='Casting Part 01',
            category='RM',
            uom='KG',
            safety_stock=50,
            is_active=True
        )
        self.comp_pm1 = RMPMComponentMaster.objects.create(
            component_code='PM-BOX-01',
            component_description='Cardboard Box 01',
            category='PM',
            uom='PCS',
            safety_stock=100,
            is_active=True
        )

        # FG Header
        self.fg1 = BOMFGHeader.objects.create(
            fg_code='7001001',
            fg_description='Finished Pump Model X',
            mini_factory='MF-A',
            line='Line-1',
            unit_price_inr=15000.0,
            active_bom_version='v1',
            is_active=True
        )

    # --- Step 9: BOM FG Header Tests ---
    def test_fg_header_crud(self):
        # List
        res = self.client.get('/api/bom/fg-headers/')
        self.assertEqual(res.status_code, 200)

        # Create valid
        res = self.client.post('/api/bom/fg-headers/', {
            'fg_code': '7001002',
            'fg_description': 'Finished Motor Y',
            'mini_factory': 'MF-B',
            'line': 'Line-2',
            'unit_price_inr': 22000.0,
        }, content_type='application/json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()['active_bom_version'], 'v1')

        # Create invalid (code not starting with 7)
        res = self.client.post('/api/bom/fg-headers/', {
            'fg_code': '6001002',
            'fg_description': 'Invalid FG',
        }, content_type='application/json')
        self.assertEqual(res.status_code, 400)

        # Patch with version change gives warning
        res = self.client.patch('/api/bom/fg-headers/7001001/', {
            'active_bom_version': 'v2'
        }, content_type='application/json')
        self.assertEqual(res.status_code, 200)
        self.assertIn('warning', res.json())

    # --- Step 10: RM/PM Component Tests ---
    def test_component_crud(self):
        # List
        res = self.client.get('/api/components/')
        self.assertEqual(res.status_code, 200)

        # Create valid
        res = self.client.post('/api/components/', {
            'component_code': 'RM-BOLT-01',
            'component_description': 'Steel Bolt M8',
            'category': 'RM',
            'uom': 'PCS',
            'safety_stock': 200
        }, content_type='application/json')
        self.assertEqual(res.status_code, 201)

        # Create invalid (starts with 7)
        res = self.client.post('/api/components/', {
            'component_code': '7009999',
            'component_description': 'Illegal RM',
            'category': 'RM'
        }, content_type='application/json')
        self.assertEqual(res.status_code, 400)

        # Create invalid (negative safety stock)
        res = self.client.post('/api/components/', {
            'component_code': 'RM-PUMP-SUB',
            'component_description': 'Sub',
            'category': 'RM',
            'safety_stock': -5
        }, content_type='application/json')
        self.assertEqual(res.status_code, 400)

    # --- Step 11: BOM Master Tests ---
    def test_bom_master_crud_and_exploded(self):
        # Create BOM line
        res = self.client.post('/api/bom/', {
            'fg_code': self.fg1.fg_code,
            'component_code': self.comp_rm1.component_code,
            'qty': 2.5,
            'uom': 'KG',
            'bom_version': 'v1'
        }, content_type='application/json')
        self.assertEqual(res.status_code, 201)
        bom_id = res.json()['id']

        # Exploded BOM
        res_exp = self.client.get(f'/api/bom/exploded/{self.fg1.fg_code}/')
        self.assertEqual(res_exp.status_code, 200)
        exp_data = res_exp.json()
        self.assertEqual(exp_data['components_count'], 1)
        self.assertEqual(exp_data['components'][0]['component_code'], self.comp_rm1.component_code)

        # Component cannot be deleted while referenced in BOM (409 Conflict)
        res_del_comp = self.client.delete(f'/api/components/{self.comp_rm1.component_code}/')
        self.assertEqual(res_del_comp.status_code, 409)

        # Delete BOM line
        res_del = self.client.delete(f'/api/bom/{bom_id}/')
        self.assertEqual(res_del.status_code, 204)

    # --- Step 12: Vendor-Buyer Master CRUD Tests ---
    def test_vendor_buyer_crud(self):
        # 1. Validation: missing supplied_components
        res_bad1 = self.client.post('/api/vendor-buyers/', {
            'vendor_code': 'V-9001',
            'vendor_name': 'Test Vendor',
            'buyer_name': 'Suresh',
            'category': 'RM',
            'lead_time_days': 5,
            'supplied_components': []
        }, content_type='application/json')
        self.assertEqual(res_bad1.status_code, 400)

        # 2. Validation: non-existent component
        res_bad2 = self.client.post('/api/vendor-buyers/', {
            'vendor_code': 'V-9001',
            'vendor_name': 'Test Vendor',
            'buyer_name': 'Suresh',
            'category': 'RM',
            'lead_time_days': 5,
            'supplied_components': ['DOES-NOT-EXIST']
        }, content_type='application/json')
        self.assertEqual(res_bad2.status_code, 400)

        # 3. Create valid
        res_create = self.client.post('/api/vendor-buyers/', {
            'vendor_code': 'V-9001',
            'vendor_name': 'Mahindra Foundry',
            'buyer_name': 'Suresh Patil',
            'category': 'RM',
            'lead_time_days': 10,
            'city': 'Kolhapur',
            'gst_no': '27ABCDE1234F1Z5',
            'supplied_components': [self.comp_rm1.component_code]
        }, content_type='application/json')
        self.assertEqual(res_create.status_code, 201)
        data = res_create.json()
        vendor_id = data['id']
        self.assertEqual(data['supplied_components'], [self.comp_rm1.component_code])
        self.assertTrue(VendorSuppliedComponent.objects.filter(vendor_buyer_id=vendor_id).exists())

        # 4. Filters & Search
        res_filter = self.client.get('/api/vendor-buyers/?buyer_name=Suresh')
        self.assertEqual(res_filter.status_code, 200)
        self.assertEqual(len(res_filter.json()['results']), 1)

        res_unpaginated = self.client.get('/api/vendor-buyers/?paginate=false')
        self.assertEqual(res_unpaginated.status_code, 200)
        self.assertIsInstance(res_unpaginated.json(), list)

        # 5. Patch scalar only
        res_patch1 = self.client.patch(f'/api/vendor-buyers/{vendor_id}/', {
            'lead_time_days': 12
        }, content_type='application/json')
        self.assertEqual(res_patch1.status_code, 200)
        self.assertEqual(res_patch1.json()['lead_time_days'], 12)
        self.assertEqual(res_patch1.json()['supplied_components'], [self.comp_rm1.component_code])

        # 6. Patch supplied_components replaces junction rows
        res_patch2 = self.client.patch(f'/api/vendor-buyers/{vendor_id}/', {
            'supplied_components': [self.comp_pm1.component_code]
        }, content_type='application/json')
        self.assertEqual(res_patch2.status_code, 200)
        self.assertEqual(res_patch2.json()['supplied_components'], [self.comp_pm1.component_code])
        junction_codes = list(VendorSuppliedComponent.objects.filter(vendor_buyer_id=vendor_id).values_list('component_id', flat=True))
        self.assertEqual(junction_codes, [self.comp_pm1.component_code])

        # 7. Delete vendor cascades junction rows
        res_del = self.client.delete(f'/api/vendor-buyers/{vendor_id}/')
        self.assertEqual(res_del.status_code, 200)
        self.assertFalse(VendorBuyerMaster.objects.filter(id=vendor_id).exists())
        self.assertFalse(VendorSuppliedComponent.objects.filter(vendor_buyer_id=vendor_id).exists())
