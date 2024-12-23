from django.contrib.auth.models import User
from django.db import models

class Room(models.Model):
    """Model pokoju, informacje zaszyfrowane kluczem symetrycznym"""
    encrypted_name = models.TextField()  # Zaszyfrowana nazwa pokoju
    encrypted_description = models.TextField()  # Zaszyfrowany opis pokoju
    def __str__(self):
        return "Encrypted Room"


class Access(models.Model):
    """Dostęp Użytkownika do pokoju."""
    PRIVILEGES = [
        ("read", "Read Only"),
        ("write", "Read and Write"),
        ("admin", "Administrator"),
    ]

    user_profile = models.ForeignKey(User, on_delete=models.CASCADE)
    room = models.ForeignKey(Room, on_delete=models.CASCADE)
    encrypted_key = models.TextField()  # Symetryczny klucz pokoju zaszyfrowany kluczem publicznym użytkownika
    privileges = models.CharField(max_length=10, choices=PRIVILEGES, default="read")

    def __str__(self):
        return f"Access for {self.user_profile} to Room {self.room.id}"

class File(models.Model):
    name = models.TextField()
    path = models.TextField()
    hash = models.TextField()
    timestamp = models.DateField()

    def __str__(self):
        return 'Encrypted File'

class Contains(models.Model):
    room_id = models.ForeignKey(Room, on_delete=models.CASCADE)
    file_id = models.ForeignKey(File, on_delete=models.CASCADE)
