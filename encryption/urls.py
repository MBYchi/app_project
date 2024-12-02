from django.urls import path
from .views import generate_keys, upload_public_key

urlpatterns = [
    path('generate-keys/', generate_keys, name='generate_keys'),
    path('upload-public-key/', upload_public_key, name='upload_public_key'),
]