# nginx/Dockerfile
FROM nginx:latest

# Copy SSL certificates
COPY certs/certificate.crt /etc/ssl/certs/server.crt
COPY certs/private.key /etc/ssl/private/server.key

# Copy Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 443