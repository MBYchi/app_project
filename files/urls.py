from django.urls import path
from .views import (FileUploadView, FileDownloadView, ListFilesMinioView, get_public_key, create_room,
                    create_room_view, list_rooms, list_rooms_view, RoomView, list_room_files, upload_file_to_room,
                    download_file, response_room_key)
import os

urlpatterns = [
    path('upload/', FileUploadView.as_view(), name='file_upload'),
    path('download/<str:file_name>/', FileDownloadView.as_view(), name='file_download'),
    path('my_files/', ListFilesMinioView.as_view(), name='list_minio_files'),
    path('api/create-room/', create_room, name='create_room'),
    path('create-room/', create_room_view, name='create_room_view'),
    path('api/list-rooms/', list_rooms, name='list_rooms'),
    path('rooms/', list_rooms_view, name="list_rooms_view"),
    path('api/get-public-key/', get_public_key, name='get_public_key'),
    path('room/<int:room_id>/', RoomView.as_view(), name='api_room_view'),  # Get room details
    path('api/room/<int:room_id>/files/', list_room_files, name='api_list_room_files'),  # List files in a room
    path('api/room/<int:room_id>/upload/', upload_file_to_room, name='api_upload_file_to_room'),  # Upload files to a room
    path('api/room/files/<int:file_id>/download/', download_file, name='api_download_file'),  # Download file by ID
    path('api/room/files/<int:room_id>/key/', response_room_key, name='api_response_room_key'),
]