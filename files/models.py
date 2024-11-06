from django.db import models
from django.contrib.auth.models import User


class EncryptedFile(models.Model):
    file = models.FileField(upload_to='files/')
    unique_id = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'File {self.unique_id}'

# Create your models here.
