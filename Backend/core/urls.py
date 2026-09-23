from django.urls import path
from .views import (
    health_check,
    BOMFGHeaderListCreateView,
    BOMFGHeaderDetailView,
    ComponentListCreateView,
    ComponentDetailView,
    BOMMasterListCreateView,
    BOMMasterDetailView,
    ExplodedBOMView,
    CommonComponentsView,
    VendorBuyerListCreateView,
    VendorBuyerDetailView,
    BOMCSVUploadView,
    VendorBuyerCSVUploadView,
)

urlpatterns = [
    path('health/', health_check, name='health_check'),

    # Step 9: BOM FG Header CRUD
    path('bom/fg-headers/', BOMFGHeaderListCreateView.as_view(), name='bom_fg_header_list_create'),
    path('bom/fg-headers/<str:fg_code>/', BOMFGHeaderDetailView.as_view(), name='bom_fg_header_detail'),

    # Step 10: RM/PM Component Master CRUD
    path('components/', ComponentListCreateView.as_view(), name='component_list_create'),
    path('components/<str:component_code>/', ComponentDetailView.as_view(), name='component_detail'),

    # Step 11: BOM Master CRUD + Exploded BOM + Common Components + CSV Upload
    path('bom/common-components/', CommonComponentsView.as_view(), name='bom_common_components'),
    path('bom/exploded/<str:fg_code>/', ExplodedBOMView.as_view(), name='bom_exploded'),
    path('bom/upload-csv/', BOMCSVUploadView.as_view(), name='bom_upload_csv'),
    path('bom/', BOMMasterListCreateView.as_view(), name='bom_master_list_create'),
    path('bom/<int:pk>/', BOMMasterDetailView.as_view(), name='bom_master_detail'),

    # Step 12: Vendor-Buyer Master CRUD + CSV Upload
    path('vendor-buyers/upload-csv/', VendorBuyerCSVUploadView.as_view(), name='vendor_buyer_upload_csv'),
    path('vendor-buyers/', VendorBuyerListCreateView.as_view(), name='vendor_buyer_list_create'),
    path('vendor-buyers/<int:pk>/', VendorBuyerDetailView.as_view(), name='vendor_buyer_detail'),
]
