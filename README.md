link-launcher
=============

Docker Compose
--------------
```yaml
version: '3.8'
services:
  web:
    image: nginx:alpine
    container_name: link_launcher
    ports:
      - "8080:80" # Access the app at http://localhost:8080
    volumes:
      # Mount the app files into the Nginx web root
      - ./index.html:/usr/share/nginx/html/index.html
      - ./links.yaml:/usr/share/nginx/html/links.yaml
    restart: unless-stopped
    security_opt:
      - no-new-privileges:true
```

Podman Run
----------
```shell
podman run -d \
  --name link_launcher \
  -p 8080:80 \
  -v ./index.html:/usr/share/nginx/html/index.html:Z \
  -v ./links.yaml:/usr/share/nginx/html/links.yaml:Z \
  --restart unless-stopped \
  --security-opt no-new-privileges \
  nginx:alpine
```