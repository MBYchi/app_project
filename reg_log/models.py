from django.contrib.auth.models import User
from django.db import models

class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    activation_token = models.CharField(max_length=128, blank=True, null=True)  # Для хранения токена
    uid_hash = models.CharField(max_length=64, blank=True, null=True)  # Для хранения хэша (uid)
    public_key = models.TextField(blank=True, null=True)  # Для хранения публичного ключа

    def __str__(self):
        return self.user.username
