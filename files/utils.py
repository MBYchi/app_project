import hashlib


def generate_unique_id(file):
    hasher = hashlib.sha256()
    for chunk in file.chunks():
        hasher.update(chunk)
    return hasher.hexdigest()


