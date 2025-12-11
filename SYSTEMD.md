# Systemd Service Setup for Tabinator

This guide explains how to set up Tabinator as a systemd service on Linux.

## Prerequisites

- Node.js installed (check with `which node` or `node --version`)
- Tabinator installed and dependencies installed (`npm install`)
- User account to run the service

## Setup Instructions

### 1. Generate a Session Secret

**IMPORTANT**: You must set a strong, random session secret for production. Here are several ways to generate one:

**Option 1: Using OpenSSL (recommended)**
```bash
openssl rand -base64 32
```

**Option 2: Using Node.js**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Option 3: Using Python**
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

**Option 4: Using /dev/urandom**
```bash
head -c 32 /dev/urandom | base64
```

Copy the generated secret - you'll need it in the next step.

### 2. Customize the Service File

Edit `tabinator.service` and update these values:

- **User**: Replace `YOUR_USERNAME` with the user who will run the service
- **WorkingDirectory**: Replace `/path/to/tabinator` with the full path to your Tabinator installation
- **ExecStart**: Update `/usr/bin/node` if Node.js is installed elsewhere (check with `which node`)
- **PORT**: Change `8080` if you want a different port
- **SESSION_SECRET**: Replace `change-this-secret-in-production` with the secret you generated above

### 3. Copy Service File

Copy the service file to systemd directory (requires root):

```bash
sudo cp tabinator.service /etc/systemd/system/
```

### 4. Reload Systemd

Reload systemd to recognize the new service:

```bash
sudo systemctl daemon-reload
```

### 5. Enable and Start Service

Enable the service to start on boot:

```bash
sudo systemctl enable tabinator
```

Start the service:

```bash
sudo systemctl start tabinator
```

### 6. Check Status

Verify the service is running:

```bash
sudo systemctl status tabinator
```

View logs:

```bash
sudo journalctl -u tabinator -f
```

## Service Management Commands

### Start/Stop/Restart

```bash
sudo systemctl start tabinator
sudo systemctl stop tabinator
sudo systemctl restart tabinator
```

### View Logs

```bash
# Follow logs in real-time
sudo journalctl -u tabinator -f

# View last 100 lines
sudo journalctl -u tabinator -n 100

# View logs since today
sudo journalctl -u tabinator --since today
```

### Check Status

```bash
sudo systemctl status tabinator
```

### Disable Auto-start

```bash
sudo systemctl disable tabinator
```

## Troubleshooting

### Service won't start

1. Check the service status: `sudo systemctl status tabinator`
2. Check logs: `sudo journalctl -u tabinator -n 50`
3. Verify paths in the service file are correct
4. Ensure the user has permissions to the working directory
5. Check that Node.js path is correct: `which node`

### Permission Issues

- Ensure the user specified in the service file owns the Tabinator directory
- Check that the `data/` directory is writable by the service user
- Verify Node.js is accessible by the service user

### Port Already in Use

If port 8080 is already in use, either:
- Change the PORT in the service file's Environment section
- Stop the service using port 8080
- Use a different port and update any reverse proxy configurations

## Example Service File (Customized)

Here's an example with typical values filled in:

```ini
[Unit]
Description=Tabinator - Self-hosted tab dashboard
After=network.target

[Service]
Type=simple
User=tabinator
WorkingDirectory=/opt/tabinator
Environment="NODE_ENV=production"
Environment="PORT=8080"
Environment="SESSION_SECRET=your-generated-secret-from-step-1"
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=tabinator

# Security settings
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

## Notes

- The service will automatically restart if it crashes (Restart=always)
- Logs are sent to systemd journal (view with `journalctl`)
- The service starts after network is available
- Security hardening options (NoNewPrivileges, PrivateTmp) are enabled

