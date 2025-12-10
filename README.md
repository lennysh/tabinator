# Tabinator

A self-hosted tab dashboard for managing and organizing browser links with user accounts, SQLite database, and browser extension support.

## Features

- 🔐 **User Authentication** - Secure login, registration, and password management
- 💾 **SQLite Database** - Reliable data storage with proper relationships
- 🏷️ **Tag System** - Organize links with tags and dynamic tag filtering
- 📁 **Group Filtering** - Create dynamic groups with include/exclude rules
- 🔍 **Search & Sort** - Find links quickly with real-time filtering
- 🚀 **Browser Extension** - Quickly add links from any webpage
- 🐳 **Docker Support** - Easy deployment with Docker/Podman
- ✅ **Input Validation** - XSS protection and data sanitization

## Architecture

* **Frontend:** Single-page application with vanilla JavaScript and Tailwind CSS
* **Backend:** Node.js/Express with SQLite database
* **Authentication:** Session-based authentication with bcrypt password hashing
* **Storage:** SQLite database with proper schema for users, links, tags, and groups

## Quick Start

### First Time Setup

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Migrate Existing Data (if upgrading from YAML version):**
   ```bash
   npm run migrate
   ```
   This creates a default user:
   - Username: `admin`
   - Password: `admin`
   - **⚠️ Change this password immediately!**

3. **Start the Server:**
   ```bash
   npm start
   ```

4. **Access the App:**
   Open `http://localhost:8080` in your browser

### New Installation

1. Install dependencies: `npm install`
2. Start the server: `npm start`
3. Register a new account at `http://localhost:8080`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `POST /api/auth/change-password` - Change user password (requires authentication)
- `GET /api/auth/me` - Get current user info

### Links (requires authentication)
- `GET /api/data` - Get all data (links, tags, groups, config)
- `POST /api/links` - Create a new link
- `PUT /api/links` - Update an existing link
- `DELETE /api/links` - Delete a link

## Browser Extension

A browser extension is included to quickly add links from any webpage.

### Installation

1. **Chrome/Edge/Brave:**
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `extension` folder

2. **Firefox:**
   - Navigate to `about:debugging`
   - Click "This Firefox"
   - Click "Load Temporary Add-on"
   - Select `extension/manifest.json`

See `extension/README.md` for detailed instructions.

## Deployment

### Docker Compose

```bash
docker-compose up --build
```

The database will be persisted in `./data/tabinator.db`.

**Important:** Set a secure `SESSION_SECRET` environment variable in production!

```bash
SESSION_SECRET=your-secure-random-string docker-compose up
```

### Podman

1. **Build the image:**
   ```bash
   podman build -t tabinator .
   ```

2. **Run the container:**
   ```bash
   podman run -d \
     --name tabinator \
     -p 8080:8080 \
     -v ./app:/usr/src/app/app:Z \
     -v ./data:/usr/src/app/data:Z \
     --restart unless-stopped \
     --security-opt no-new-privileges \
     tabinator
   ```

3. **Run migration (first time only):**
   ```bash
   podman exec -it tabinator npm run migrate
   ```

## Database Schema

- **users** - User accounts
- **links** - Link entries
- **tags** - Tag definitions
- **link_tags** - Many-to-many relationship between links and tags
- **groups** - Group definitions
- **group_rules** - Include/exclude rules for groups
- **user_config** - User-specific configuration

See `database/schema.sql` for the complete schema.

## Migration from YAML

If you're upgrading from the old YAML-based version, see [MIGRATION.md](MIGRATION.md) for detailed instructions.

## Security Features

- Password hashing with bcrypt
- Session-based authentication
- Input validation and sanitization
- XSS protection
- SQL injection prevention (parameterized queries)
- User data isolation

## Development

### Project Structure

```
.
├── app/              # Frontend files
│   └── index.html   # Main application
├── database/        # Database files
│   ├── schema.sql   # Database schema
│   └── init.js      # Database initialization
├── extension/       # Browser extension
├── middleware/      # Express middleware
│   ├── auth.js      # Authentication middleware
│   └── validation.js # Input validation
├── routes/          # API routes
│   ├── auth.js      # Authentication routes
│   └── links.js     # Link management routes
├── scripts/         # Utility scripts
│   └── migrate-yaml-to-sqlite.js
└── server.js        # Main server file
```

### Environment Variables

- `PORT` - Server port (default: 8080)
- `SESSION_SECRET` - Secret for session cookies (required in production!)
- `NODE_ENV` - Environment (production/development)
- `CORS_ORIGIN` - CORS origin (default: all origins)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is open source and available for personal use.

## Troubleshooting

### Can't login after migration
- Default credentials: `admin` / `admin`
- Check database exists: `ls -la data/tabinator.db`
- Try re-running migration: `npm run migrate`

### Extension can't connect
- Verify Tabinator URL in extension settings
- Check that you're logged in to Tabinator in your browser
- Ensure CORS is configured correctly

### Database errors
- Check file permissions on `data/` directory
- Verify SQLite is installed: `sqlite3 --version`
- Check server logs for detailed error messages
