# HTTPS Setup Guide for Tabinator

## Recommended Approach: Reverse Proxy (Production)

**For production, use a reverse proxy like Nginx, Traefik, or Caddy with Let's Encrypt certificates.**

### Why Use a Reverse Proxy?

1. **Proper SSL Certificates**: Let's Encrypt provides free, trusted certificates
2. **Better Security**: Reverse proxies handle SSL termination and can add security headers
3. **Performance**: Reverse proxies can handle caching, compression, etc.
4. **Flexibility**: Easy to add multiple services behind the same proxy

### Option 1: Nginx with Let's Encrypt (Recommended)

1. **Install Nginx and Certbot:**
   ```bash
   sudo apt-get update
   sudo apt-get install nginx certbot python3-certbot-nginx
   ```

2. **Get Let's Encrypt Certificate:**
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```

3. **Configure Nginx:**
   - Copy `nginx.conf.example` to `/etc/nginx/sites-available/tabinator`
   - Update `your-domain.com` with your actual domain
   - Enable the site: `sudo ln -s /etc/nginx/sites-available/tabinator /etc/nginx/sites-enabled/`
   - Test: `sudo nginx -t`
   - Reload: `sudo systemctl reload nginx`

4. **Update Tabinator server.js** to trust the proxy:
   ```javascript
   app.set('trust proxy', 1); // Add this before session middleware
   ```

### Option 2: Caddy (Easiest)

Caddy automatically handles HTTPS with Let's Encrypt:

```bash
# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy

# Create Caddyfile
cat > /etc/caddy/Caddyfile <<EOF
your-domain.com {
    reverse_proxy localhost:8080
}
EOF

# Start Caddy
sudo systemctl start caddy
sudo systemctl enable caddy
```

---

## Alternative: HTTPS Directly in Container (Development/Testing Only)

**⚠️ Warning: Self-signed certificates will show browser warnings. Only use for development/testing.**

### Generate Self-Signed Certificate

```bash
mkdir -p certs
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout certs/key.pem \
  -out certs/cert.pem \
  -days 365 \
  -subj "/CN=localhost"
```

### Update server.js to Support HTTPS

The server would need to be modified to:
1. Read the certificate files
2. Create an HTTPS server
3. Optionally redirect HTTP to HTTPS

### Update docker-compose.yml

Use `docker-compose.https.yml` as a reference, but note:
- Self-signed certs will show browser warnings
- You'll need to accept the certificate in each browser
- Not suitable for production

---

## Recommendation

**For local development**: Use HTTP (current setup is fine)

**For production**: Use a reverse proxy (Nginx/Caddy) with Let's Encrypt certificates. This is the industry standard and provides:
- Trusted certificates (no browser warnings)
- Automatic certificate renewal
- Better security practices
- Easier maintenance

