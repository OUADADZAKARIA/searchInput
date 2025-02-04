# Construire Matomo (PHP-FPM)
cd matomo
docker build -t matomo-fargate .

# Construire NGINX
cd ../nginx
docker build -t nginx-fargate .