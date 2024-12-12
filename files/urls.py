from django.urls import path
from .views import FileUploadView, FileDownloadView, ListFilesMinioView, get_public_key, create_room, create_room_view, list_rooms, list_rooms_view
import os

urlpatterns = [
    path('upload/', FileUploadView.as_view(), name='file_upload'),
    path('download/<str:file_name>/', FileDownloadView.as_view(), name='file_download'),
    path('my_files/', ListFilesMinioView.as_view(), name='list_minio_files'),
    path('api/create-room/', create_room, name='create_room'),
    path('create-room/', create_room_view, name='create_room_view'),
    path('api/list-rooms/', list_rooms, name='list_rooms'),
    path('rooms/', list_rooms_view, name="list_rooms_view")
]