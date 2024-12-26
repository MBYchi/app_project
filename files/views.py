import hashlib

from django.core.exceptions import ObjectDoesNotExist
from django.shortcuts import render, redirect, get_object_or_404
from django.http import HttpResponse, JsonResponse
from django.core.files.storage import default_storage
from django.views import View
from django.contrib.auth.decorators import login_required
from django.utils.decorators import method_decorator
import logging
import boto3
from botocore.client import Config
from django.conf import settings
from botocore.exceptions import ClientError
import os
from django.http import Http404
from django.views.decorators.csrf import csrf_exempt
import json
from urllib.parse import quote
from .models import Room, Access, File, Contains
from django.utils import timezone
from urllib.parse import quote
from django.db import transaction
from django.contrib.auth.models import User

@login_required
def get_public_key(request):
    profile = request.user.profile
    if profile.public_key:
        return JsonResponse({"public_key": profile.public_key}, status=200)
    return JsonResponse({"error": "Public key not found."}, status=404)

@login_required()
@csrf_exempt
def create_room(request):
    if request.method == "POST":
        data = json.loads(request.body)

        encrypted_name = data.get("encrypted_name")
        encrypted_description = data.get("encrypted_description")
        encrypted_key = data.get("encrypted_key")

        if not (encrypted_name and encrypted_description and encrypted_key):
            return JsonResponse({"message": "Invalid data"}, status=400)

        room = Room.objects.create(
            encrypted_name=encrypted_name,
            encrypted_description=encrypted_description,
        )

        # Step 2: Assign access to the creator with admin privileges
        Access.objects.create(
            user_profile=request.user,
            room=room,
            encrypted_key=encrypted_key,  # Store the room's symmetric key encrypted with the user's public key
            privileges="admin",  # Grant admin privileges to the creator
        )

        # Step 3: Create a folder in the MinIO bucket using boto3
        try:
            s3_client = boto3.client(
                "s3",
                endpoint_url=f"http://{settings.MINIO_ENDPOINT}",
                aws_access_key_id=settings.MINIO_ACCESS_KEY,
                aws_secret_access_key=settings.MINIO_SECRET_KEY,
                config=Config(signature_version="s3v4"),
                region_name="us-east-1",  # Adjust based on your region
                use_ssl=settings.AWS_S3_USE_SSL,  # Respect SSL setting from your config
            )

            # Create an empty object to simulate a "folder" in S3-compatible storage
            folder_name = quote(f"{room.encrypted_name}", safe = '') + "/"  # Encrypted name as folder
            bucket_name = settings.MINIO_BUCKET_NAME

            s3_client.put_object(
                Bucket=bucket_name,
                Key=folder_name,  # S3 treats keys ending in "/" as folders
            )

        except Exception as e:
            # Rollback room creation if MinIO folder creation fails
            room.delete()
            return JsonResponse({"message": f"Error creating folder: {str(e)}"}, status=500)

        return JsonResponse({"message": "Room created successfully", "room_id": room.id}, status=201)

    return JsonResponse({"message": "Invalid method"}, status=405)

@login_required
def create_room_view(request):
    """
    Render the HTML page where users can input data for room creation.
    """
    return render(request, 'files/create_room.html')


@login_required
def list_rooms(request):
    """
    API to list rooms the user has access to.
    """
    user_accesses = Access.objects.filter(user_profile=request.user).select_related("room")
    rooms_data = []

    for access in user_accesses:
        room = access.room
        rooms_data.append({
            "room_id": room.id,
            "encrypted_name": room.encrypted_name,
            "encrypted_description": room.encrypted_description,
            "encrypted_key": access.encrypted_key,
            "privileges": access.privileges,
        })

    return JsonResponse({"rooms": rooms_data}, status=200)


@login_required
def list_rooms_view(request):
    """
    Render an HTML page displaying the list of rooms accessible to the logged-in user.
    """
    user = request.user
    access_entries = Access.objects.filter(user_profile=user)

    # Pass encrypted data to the template
    rooms = [
        {
            "encrypted_name": access.room.encrypted_name,
            "encrypted_description": access.room.encrypted_description,
            "encrypted_key": access.encrypted_key,
        }
        for access in access_entries
    ]

    return render(request, 'files/list_rooms.html', {"rooms": rooms})

@login_required
@csrf_exempt
def delete_room(request, room_id):
    if request.method != "DELETE":
        return JsonResponse({"message": "Invalid method"}, status=405)

    try:
        access_entry = Access.objects.get(room_id=room_id, user_profile=request.user)

        # Check if the user has admin privileges
        if access_entry.privileges != "admin":
            return JsonResponse({"message": "Permission denied. Only admin users can delete rooms."}, status=403)

        with transaction.atomic():
            # (Optional) Delete related files in MinIO bucket
            try:
                s3_client = boto3.client(
                    "s3",
                    endpoint_url=f"http://{settings.MINIO_ENDPOINT}",
                    aws_access_key_id=settings.MINIO_ACCESS_KEY,
                    aws_secret_access_key=settings.MINIO_SECRET_KEY,
                    config=Config(signature_version="s3v4"),
                    region_name="us-east-1",
                    use_ssl=settings.AWS_S3_USE_SSL,
                )
                folder_name = quote(access_entry.room.encrypted_name, safe='') + "/"
                bucket_name = settings.MINIO_BUCKET_NAME

                # List and delete all files in the folder
                objects_to_delete = s3_client.list_objects_v2(Bucket=bucket_name, Prefix=folder_name)
                if "Contents" in objects_to_delete:
                    delete_keys = {"Objects": [{"Key": obj["Key"]} for obj in objects_to_delete["Contents"]]}
                    s3_client.delete_objects(Bucket=bucket_name, Delete=delete_keys)
            except Exception as e:
                return JsonResponse({"message": f"Error deleting MinIO files: {str(e)}"}, status=500)
            room = Room.objects.filter(id=room_id).first()
            for contain in Contains.objects.filter(room_id = room):
                contain.file_id.delete()
            Access.objects.filter(room_id=room_id).delete()
            room.delete()
        return JsonResponse({"message": "Room deleted successfully"}, status=200)

    except Access.DoesNotExist:
        return JsonResponse({"message": "Room not found or access denied"}, status=404)

    except Exception as e:
        return JsonResponse({"message": f"An error occurred: {str(e)}"}, status=500)

class RoomView(View):
    def get(self, request, room_id):
        # Check user access to the room
        try:
            access = Access.objects.get(user_profile=request.user, room_id=room_id)
            if access.privileges != "admin":
                shared_users = []  # No shared users for non-admins
            else:
                shared_users = Access.objects.filter(room_id=room_id).exclude(user_profile=request.user).values(
                    'user_profile__username', 'privileges'
                )
        except Access.DoesNotExist:
            raise Http404("You do not have access to this room.")

        room = access.room

        return render(request, 'files/room_view.html', {
            "room_id": room.id,
            "encrypted_name": room.encrypted_name,
            "encrypted_description": room.encrypted_description,
            "privileges": access.privileges,
            "shared_users": json.dumps(list(shared_users), ensure_ascii=False),
        })

@login_required
def list_room_files(request, room_id):
    try:
        # Verify user has access to the room
        access = Access.objects.get(user_profile=request.user, room_id=room_id)

        # Fetch files for the room
        file_records = File.objects.filter(contains__room_id=room_id)
        if not file_records.exists():
            return JsonResponse({"message": "There are no files in this room."}, status=200)

        # Prepare file metadata to send
        files = [
            {
                "file_id": file.id,
                "encrypted_name": file.name,  # Already encrypted
                "hash": file.hash,
                "timestamp": file.timestamp.strftime("%Y-%m-%d"),
            }
            for file in file_records
        ]

        return JsonResponse({"files": files}, status=200)

    except Access.DoesNotExist:
        return JsonResponse({"error": "No access to this room."}, status=403)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)

@login_required
def upload_file_to_room(request, room_id):
    if request.method != "POST":
        return JsonResponse({"error": "Invalid request method"}, status=405)

    try:
        access = Access.objects.get(user_profile=request.user, room_id=room_id)
        if access.privileges not in ['admin', 'write']:
            return JsonResponse({"error": "You do not have write access to this room."}, status=403)

        room = access.room

        if 'file' not in request.FILES or 'file_name' not in request.POST:
            return JsonResponse({"error": "Invalid file upload data"}, status=400)

        file = request.FILES['file']
        encrypted_name = request.POST['file_name']

        # Compute file checksum
        file_checksum = hashlib.sha256(file.read()).hexdigest()
        file.seek(0)  # Reset the file pointer after reading

        # Upload to MinIO
        s3_client = boto3.client(
            's3',
            endpoint_url=f"http://{settings.MINIO_ENDPOINT}",
            aws_access_key_id=settings.MINIO_ACCESS_KEY,
            aws_secret_access_key=settings.MINIO_SECRET_KEY,
        )

        bucket_name = settings.MINIO_BUCKET_NAME
        object_key = quote(f"{room.encrypted_name}", safe = '') + "/" + quote(f"{encrypted_name}", safe = '')

        # Upload the file
        s3_client.upload_fileobj(file, bucket_name, object_key)
        # Save file metadata in the database
        file_instance = File.objects.create(
            name=encrypted_name,  # Encrypted file name
            path=object_key,  # Path or object key in storage
            hash=file_checksum,  # File checksum for integrity verification
            timestamp=timezone.now(),  # Current timestamp
        )

        # Step 2: Link the File to a Room using the Contains model
        Contains.objects.create(
            room_id=room,  # Room instance
            file_id=file_instance  # Newly created File instance
        )

        return JsonResponse({"message": "File uploaded successfully"}, status=201)

    except Access.DoesNotExist:
        return JsonResponse({"error": "No access to room."}, status=403)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)

@login_required
def download_file(request, file_hash):
    try:
        print("I'm here")
        file_record = File.objects.get(hash = file_hash)
        print("file found")
        print(file_record.id)
        room = Contains.objects.get(file_id = file_record).room_id
        print("room found")
        # Verify the user has access to the room
        if not Access.objects.filter(user_profile=request.user, room=room).exists():
            return JsonResponse({"error": "No access to this room."}, status=403)

        # Fetch file from MinIO
        s3_client = boto3.client(
            's3',
            endpoint_url=f"http://{settings.MINIO_ENDPOINT}",
            aws_access_key_id=settings.MINIO_ACCESS_KEY,
            aws_secret_access_key=settings.MINIO_SECRET_KEY,
        )

        bucket_name = settings.MINIO_BUCKET_NAME
        object_key = file_record.path

        # Generate a presigned URL for download
        try:
            presigned_url = s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': bucket_name, 'Key': object_key},
                ExpiresIn=3600,  # URL valid for 1 hour
            )
            return JsonResponse({
                "download_url": presigned_url,
                "encrypted_name": file_record.name  # Encrypted file name
            }, status=200)
        except ClientError as e:
            return JsonResponse({"error": "Failed to generate download link"}, status=500)

    except File.DoesNotExist:
        return JsonResponse({"error": "File not found"}, status=404)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)

@login_required
def delete_file(request, file_hash):
    if request.method != "DELETE":
        return JsonResponse({"error": "Invalid request method"}, status=405)

    try:
        # Find the file by its hash
        file_record = File.objects.get(hash=file_hash)
        room = Contains.objects.get(file_id=file_record).room_id

        # Verify the user has access and sufficient privileges
        access = Access.objects.filter(user_profile=request.user, room=room).first()
        if not access or access.privileges not in ['admin', 'write']:
            return JsonResponse({"error": "You do not have sufficient privileges to delete files."}, status=403)

        # Remove the file from MinIO
        s3_client = boto3.client(
            's3',
            endpoint_url=f"http://{settings.MINIO_ENDPOINT}",
            aws_access_key_id=settings.MINIO_ACCESS_KEY,
            aws_secret_access_key=settings.MINIO_SECRET_KEY,
        )
        bucket_name = settings.MINIO_BUCKET_NAME
        object_key = file_record.path

        try:
            s3_client.delete_object(Bucket=bucket_name, Key=object_key)
        except ClientError as e:
            return JsonResponse({"error": "Failed to delete file from storage."}, status=500)

        # Remove the file record and its association
        file_record.delete()

        return JsonResponse({"message": "File deleted successfully."}, status=200)

    except File.DoesNotExist:
        return JsonResponse({"error": "File not found."}, status=404)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)

@login_required()
def response_room_key(request, room_id):
    access = Access.objects.filter(user_profile=request.user, room_id=room_id)
    return JsonResponse({"encrypted_key" : access[0].encrypted_key})

@login_required
def fetch_user_public_key(request, username):
    """
    Fetch the public key of a user by their username.
    """
    user = get_object_or_404(User, username=username)
    # Assuming `public_key` is a field in the User model or its profile
    return JsonResponse({"public_key": user.profile.public_key})

@csrf_exempt
@login_required
def share_room(request, room_id):
    """
    Add an entry to the Access table for the new user with the encrypted symmetric key and privileges.
    """
    if request.method == "POST":
        admin_access = get_object_or_404(Access, room_id=room_id, user_profile=request.user)
        if admin_access.privileges != "admin":
            return JsonResponse({"error": "You do not have permission to share this room."}, status=403)

        data = json.loads(request.body)
        target_user = get_object_or_404(User, username=data["username"])
        new_encrypted_key = data["encrypted_key"]
        privileges = data.get("privileges", "read")  # Default privileges

        if privileges not in ["read", "write"]:
            return JsonResponse({"error": "Invalid privilege level."}, status=400)

        Access.objects.create(
            user_profile=target_user,
            room_id=admin_access.room.id,
            encrypted_key=new_encrypted_key,
            privileges=privileges,
        )

        return JsonResponse({"message": "Room shared successfully."})

    return JsonResponse({"error": "Invalid request method."}, status=405)
@login_required()
@csrf_exempt
def remove_shared_user(request, roomId, username):
    if request.method == "DELETE":
        room = get_object_or_404(Room, id=roomId)

        try:
            access = get_object_or_404(Access, room = room, user_profile__username=username)
        except ObjectDoesNotExist:
            return JsonResponse({"error": "Access not found."}, status=404)

        access.delete()
        return JsonResponse({"message": "User removed successfully."}, status=200)