from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
import json
@login_required
def generate_keys(request):
    user_profile = request.user.profile
    # if user_profile.public_key:
    #     return redirect('home')  # Перенаправление, если ключ уже есть
    return render(request, 'encryption/generate_keys.html')



@csrf_exempt
def upload_public_key(request):
    if request.method == "POST":
        try:
            data = json.loads(request.body)
            public_key = data.get("public_key")

            if not public_key:
                return JsonResponse({"error": "Public key is missing."}, status=400)

            # Сохраняем публичный ключ в профиль пользователя
            user = request.user
            if not user.profile.public_key:
                user.profile.public_key = public_key
                user.profile.save()
                return JsonResponse({"message": "Public key uploaded successfully."}, status=200)
            return JsonResponse({"message": "Public key was already uploaded."}, status=200)

        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)

    return JsonResponse({"error": "Method not allowed."}, status=405)