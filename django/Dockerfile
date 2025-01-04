# django/Dockerfile
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libmariadb-dev \
    libffi-dev \
    pkg-config && \
    rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set work directory
WORKDIR /app

# Install Python dependencies
COPY django/requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy project files
COPY django /app/

RUN chmod +x /app/start.sh && ls -l /app/start.sh
RUN mkdir -p /app/staticfiles
# Expose port 8000 and run the server
EXPOSE 8000

#CMD ["/app/start.sh"]




