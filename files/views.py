from django.shortcuts import render, redirect
from django.http import HttpResponse, JsonResponse
from django.core.files.storage import default_storage
from django.views import View
from django.contrib.auth.decorators import login_required
from django.utils.decorators import method_decorator
import logging
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
        file_path = f"user_{request.user.id}/{file_name}"

        # Checking the existence of the file
        #Нужно подумать
        # if not default_storage.exists(file_path):
        #     return JsonResponse({"error": "File not found"}, status=404)

        # get the URL of the file and redirect to it
        file_url = default_storage.url(file_path)
        logging.info(f"Attempting to redirect to file URL: {file_url}")
        return redirect(file_url)
