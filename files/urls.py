from django.contrib.auth import login
from django.urls import path
from .views import FileUploadView, FileDownloadView, ListFilesMinioView
import os

urlpatterns = [
    path('upload/', FileUploadView.as_view(), name='file_upload'),
    path('download/<str:file_name>/', FileDownloadView.as_view(), name='file_download'),
    path('my_files/', ListFilesMinioView.as_view(), name='list_minio_files'),
]
