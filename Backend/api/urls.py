from django.urls import path, include

urlpatterns = [
    path('', include('core.urls')),
    path('v1/', include('core.urls')),
]
