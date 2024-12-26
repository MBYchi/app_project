from django.urls import path
from .views import (FileUploadView, FileDownloadView, ListFilesMinioView, get_public_key, create_room,
                    create_room_view, list_rooms, list_rooms_view, RoomView, list_room_files, upload_file_to_room,
                    download_file, response_room_key, delete_room, delete_file, fetch_user_public_key, share_room, remove_shared_user)
import os

urlpatterns = [
    path('upload/', FileUploadView.as_view(), name='file_upload'),
    path('download/<str:file_name>/', FileDownloadView.as_view(), name='file_download'),
    path('my_files/', ListFilesMinioView.as_view(), name='list_minio_files'),
    path('api/create-room/', create_room, name='create_room'),
    path('create-room/', create_room_view, name='create_room_view'),
    path('api/list-rooms/', list_rooms, name='list_rooms'),
    path('api/delete-room/<int:room_id>/', delete_room, name='delete_room'),
    path('rooms/', list_rooms_view, name="list_rooms_view"),
    path('api/get-public-key/', get_public_key, name='get_public_key'),
    path('room/<int:room_id>/', RoomView.as_view(), name='api_room_view'),  # Get room details
    path('api/room/<int:room_id>/files/', list_room_files, name='api_list_room_files'),  # List files in a room
    path('api/room/<int:room_id>/upload/', upload_file_to_room, name='api_upload_file_to_room'),  # Upload files to a room
    path("api/room/files/<str:file_hash>/delete/", delete_file, name="delete_file"),
    path('api/room/files/<str:file_hash>/download/', download_file, name='api_download_file'),  # Download file by ID
    path('api/room/files/<int:room_id>/key/', response_room_key, name='api_response_room_key'),
    path('api/user/<str:username>/public_key/', fetch_user_public_key, name='fetch_user_public_key'),
    path('api/room/<int:room_id>/share/', share_room, name='share_room'),
    path('api/room/<int:roomId>/shared-users/<str:username>/', remove_shared_user, name='remove_shared_user'),
]