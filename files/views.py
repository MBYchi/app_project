import hashlib

from django.shortcuts import render, redirect
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



# The page for uploading files
@method_decorator(login_required, name='dispatch')
class FileUploadView(View):
    def get(self, request):
        return render(request, 'files/file_upload.html')

    def post(self, request):
        # Checking the file has been sent
        if 'file' not in request.FILES:
            return JsonResponse({"error": "No file uploaded"}, status=400)

        file = request.FILES['file']
        file_name = f"user_{request.user.id}/{file.name}"  # Setting the storage path with the user ID

        # Saving a file to the storage
        saved_file_name = default_storage.save(file_name, file)

        return JsonResponse({
            "message": "File uploaded successfully",
            "file_name": saved_file_name
        }, status=201)

# The page for downloading files
@method_decorator(login_required, name='dispatch')
class FileDownloadView(View):
    def get(self, request, file_name):
        bucket_name = os.getenv('MINIO_BUCKET_NAME')  # Replace with your S3 bucket name
        object_name = f"user_{request.user.id}/{file_name}"  # Construct the S3 object key

        try:
            s3_client = boto3.client(
                's3',
                endpoint_url=f"http://{settings.MINIO_ENDPOINT}",
                aws_access_key_id=settings.MINIO_ACCESS_KEY,
                aws_secret_access_key=settings.MINIO_SECRET_KEY,
                config=Config(signature_version='s3v4'),
                region_name="us-east-1",  # Adjust based on your region
                use_ssl=settings.AWS_S3_USE_SSL  # Respect SSL setting from your config
            )
            # Check if the file exists by attempting to get its metadata
            s3_client.head_object(Bucket=bucket_name, Key=object_name)

            # Download the file from S3
            response = s3_client.get_object(Bucket=bucket_name, Key=object_name)
            file_data = response['Body'].read()
            content_type = response['ContentType']  # Get the file's MIME type from S3

            # Build an HTTP response for the file download
            http_response = HttpResponse(
                file_data,
                content_type=content_type
            )
            http_response['Content-Disposition'] = f'attachment; filename="{file_name}"'
            logging.info(f"File '{file_name}' successfully prepared for download.")
            return http_response

        except ClientError as e:
            if e.response['Error']['Code'] == '404':
                logging.error(f"File '{object_name}' not found in bucket '{bucket_name}'.")
                return JsonResponse({"error": "File not found"}, status=404)
            else:
                logging.error(f"Error interacting with S3: {e}")
                return JsonResponse({"error": "An error occurred while fetching the file"}, status=500)

        except Exception as e:
            logging.error(f"Unexpected error: {e}")
            return JsonResponse({"error": "An unexpected error occurred"}, status=500)


    # The page for downloading filesеасеа
@method_decorator(login_required, name='dispatch')
class ListFilesMinioView(View):
    def get(self, request):
        """
        Django view to list files in the MinIO bucket using Boto3.
        """
        try:
            # Initialize the Boto3 S3 client
            s3_client = boto3.client(
                's3',
                endpoint_url=f"http://{settings.MINIO_ENDPOINT}",
                aws_access_key_id=settings.MINIO_ACCESS_KEY,
                aws_secret_access_key=settings.MINIO_SECRET_KEY,
                config=Config(signature_version='s3v4'),
                region_name="us-east-1",  # Adjust based on your region
                use_ssl=settings.AWS_S3_USE_SSL  # Respect SSL setting from your config
            )

            # List objects in the MinIO bucket
            bucket_name = settings.MINIO_BUCKET_NAME
            folder_prefix = f"user_{request.user.id}/"  # Example folder name in the bucket

            # List objects with a specific prefix (folder)
            response = s3_client.list_objects_v2(
                Bucket=bucket_name,
                Prefix=folder_prefix,  # Filter files inside the folder
                Delimiter='/'
            )

            # Prepare a list of file names
            if 'Contents' in response:
                files = [
                    obj["Key"].replace(folder_prefix, "")  # Remove the folder prefix for display
                    for obj in response["Contents"]
                ]
            else:
                files = []

            # Render the HTML template with the list of files
            return render(request, 'files/list_files.html', {'files': files})

        except Exception as e:
            # Render the error message in the HTML
            raise Http404(f"An error occurred: {str(e)}")


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
        except Access.DoesNotExist:
            raise Http404("You do not have access to this room.")

        room = access.room

        return render(request, 'files/room_view.html', {
            "room_id": room.id,
            "encrypted_name": room.encrypted_name,
            "encrypted_description": room.encrypted_description,
            "privileges": access.privileges,
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

