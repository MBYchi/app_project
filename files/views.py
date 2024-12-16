
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

from .models import Room, Access


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
            folder_name = f"{room.encrypted_name}/"  # Encrypted name as folder
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


