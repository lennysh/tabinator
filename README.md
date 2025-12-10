# Tabinator

A self-hosted tab dashboard for managing and organizing browser links with user accounts, SQLite database, and browser extension support.

<div align="center">
  <img src="images/tabinator.png" alt="Tabinator Screenshot" width="800" />
</div>

## Features

- 🔐 **User Authentication** - Secure login with username or email, registration, and password management with persistent sessions
- ⚙️ **Settings** - Manage your account settings including email address, max tabs limit, and password
- 📤 **Export/Import** - Export links to CSV for backup or import from CSV (merge mode)
- 💾 **SQLite Database** - Reliable data storage with proper relationships
- 🏷️ **Tag System** - Organize links with tags and dynamic tag filtering
- 📁 **Group Filtering** - Create dynamic groups with include/exclude rules:
  - **Within each block**: Tags OR Names OR URLs (if any field matches, the block matches)
  - **Between Include blocks**: Block 1 AND Block 2 AND Block 3... (all blocks must match)
  - **Between Exclude blocks**: Block 1 OR Block 2 OR Block 3... (if any block matches, exclude the link)
  - **Groups with only exclude blocks**: Match all links EXCEPT those matching any exclude block
  - **Groups with only include blocks**: Match only links that match ALL include blocks
  - **Groups with both**: (All Include blocks match) AND NOT (Any Exclude block matches)
- 🔍 **Search & Sort** - Find links quickly with real-time filtering and multiple sort options:
  - Name (A-Z) - Default
  - Name (Z-A)
  - Created (Newest First)
  - Created (Oldest First)
  - Updated (Newest First)
  - Updated (Oldest First)
- 🚀 **Browser Extension** - Quickly add, edit, or delete links from any webpage
- 🐳 **Docker Support** - Easy deployment with Docker/Podman
- ✅ **Input Validation** - XSS protection and data sanitization
- 🔄 **Auto-clear Filters** - Automatically clears filters when no matching links remain

## Architecture

* **Frontend:** Single-page application with vanilla JavaScript and Tailwind CSS
* **Backend:** Node.js/Express with SQLite database
* **Authentication:** Session-based authentication with bcrypt password hashing and persistent sessions (survives server restarts)
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
4. After registration, you can login with either your username or email address

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user (accepts username or email)
- `POST /api/auth/logout` - Logout user
- `POST /api/auth/change-password` - Change user password (requires authentication)
- `GET /api/auth/me` - Get current user info
- `GET /api/auth/profile` - Get user profile and config (requires authentication)
- `PUT /api/auth/profile` - Update user email address (requires authentication)
- `PUT /api/auth/config` - Update user config (max_tabs_open) (requires authentication)

### Links (requires authentication)
- `GET /api/data` - Get all data (links, tags, groups, config)
- `POST /api/links` - Create a new link
- `PUT /api/links` - Update an existing link
- `DELETE /api/links` - Delete a link
- `GET /api/export` - Export all links as CSV file
- `POST /api/import` - Import links from CSV file (merge mode)

### Groups (requires authentication)
- `GET /api/groups` - Get all groups for the current user
- `POST /api/groups` - Create a new group
- `PUT /api/groups/:id` - Update an existing group
- `DELETE /api/groups/:id` - Delete a group

## Browser Extension

A browser extension is included to quickly add, edit, or delete links from any webpage.

### Features

- **Smart Detection** - Automatically detects if the current page is already saved
- **Edit Mode** - Automatically switches to edit mode for existing links
- **Delete Links** - Remove links directly from the extension popup
- **Visual Indicator** - Extension icon shows a green checkmark (✓) when viewing a saved page
- **Auto-sync** - Icon badge updates automatically as you navigate between pages

### Installation

1. **Chrome/Edge/Brave/Vivaldi:**
   - Navigate to `chrome://extensions/` (or `edge://extensions/`, `vivaldi://extensions/`)
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

The database will be persisted in `./data/tabinator.db`, and sessions will be persisted in `./data/sessions.db`.

**Important:** Set a secure `SESSION_SECRET` environment variable in production!

```bash
SESSION_SECRET=your-secure-random-string docker-compose up
```

Sessions persist across server restarts, so you won't need to log in again after restarting the server.

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
- Session-based authentication with persistent storage (SQLite)
- Input validation and sanitization
- XSS protection
- SQL injection prevention (parameterized queries)
- User data isolation
- Secure session cookies (httpOnly, secure in production)

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
│   ├── links.js     # Link management routes
│   └── groups.js    # Group management routes
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

This project is licensed under the MIT License.

See the [LICENSE](LICENSE) file for details.

## Settings

Access Settings from the top navigation bar to manage your account:

- **Email Address**: View and update your email address (you can use email or username to login)
- **Max Tabs Open Limit**: Configure the safety limit for opening multiple tabs (default: 20, range: 1-1000)
- **Export Links**: Download all your links as a CSV file for backup or migration
- **Import Links**: Import links from a CSV file (merge mode - updates existing links, adds new ones)
- **Change Password**: Update your password with validation requirements

All settings are saved immediately and persist across sessions.

### Export/Import Format

The CSV export includes the following columns:
- `name` - Link name/title
- `url` - Link URL
- `tags` - Comma-separated list of tags
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

When importing:
- Links are matched by URL (case-sensitive)
- Existing links are updated with new name and tags
- New links are created
- Tags are merged (existing tags are replaced with imported tags)

## Troubleshooting

### Can't login after migration
- Default credentials: `admin` / `admin`
- You can login with either username (`admin`) or email address
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

### Group filtering not working as expected
- Remember: Include blocks use AND logic (all must match)
- Exclude blocks use OR logic (any match excludes the link)
- Within each block, Tags/Names/URLs use OR logic
- Check the info box in the group edit modal for detailed logic explanation
