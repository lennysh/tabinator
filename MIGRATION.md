# Migration Guide: YAML to SQLite

This guide will help you migrate from the old YAML-based storage to the new SQLite database with user accounts.

## Prerequisites

1. Make sure you have Node.js installed
2. Install dependencies: `npm install`
3. Ensure your `app/links.yaml` file exists (if you have existing data)

## Migration Steps

### 1. Backup Your Data

**Important:** Before migrating, backup your `app/links.yaml` file:

```bash
cp app/links.yaml app/links.yaml.backup
```

### 2. Run the Migration

Execute the migration script:

```bash
npm run migrate
```

This will:
- Create the SQLite database in `data/tabinator.db`
- Create a default user account:
  - **Username:** `admin`
  - **Password:** `admin`
- Migrate all your links, tags, and groups to the database
- Migrate your config settings (like `max_tabs_open`)

### 3. Start the Server

```bash
npm start
```

### 4. Login and Change Password

1. Open `http://localhost:8080` in your browser
2. Login with the default credentials:
   - Username: `admin`
   - Password: `admin`
3. **IMPORTANT:** Change your password immediately after first login:
   - Click the "Change Password" button in the top-right auth bar
   - Enter your current password (`admin`)
   - Enter your new password (must meet requirements: 8+ chars, uppercase, lowercase, number)
   - Confirm your new password

### 5. Verify Your Data

- Check that all your links appear
- Verify tags are working
- Test group filtering
- Confirm your config settings

## Creating Additional Users

You can create new user accounts through the web interface:
1. Click "Register" on the login page
2. Fill in username, email, and password
3. Each user will have their own isolated links, tags, and groups

## Troubleshooting

### Migration Fails

If the migration fails:
1. Check that `app/links.yaml` exists and is valid YAML
2. Check file permissions
3. Review error messages in the console

### Can't Login

If you can't login:
1. Verify the database was created: `ls -la data/tabinator.db`
2. Check server logs for errors
3. Try running the migration again (it's safe to re-run)

### Data Missing

If some data is missing after migration:
1. Check your backup: `app/links.yaml.backup`
2. Review the migration script output for errors
3. The migration script will skip invalid entries and continue

## Database Location

- **Local:** `data/tabinator.db`
- **Docker:** `/usr/src/app/data/tabinator.db` (mounted to `./data` on host)

## Manual Database Access

You can inspect the database using SQLite:

```bash
sqlite3 data/tabinator.db
```

Example queries:
```sql
-- List all users
SELECT id, username, email FROM users;

-- List all links for a user
SELECT name, url FROM links WHERE user_id = 1;

-- Count links per user
SELECT u.username, COUNT(l.id) as link_count
FROM users u
LEFT JOIN links l ON u.id = l.user_id
GROUP BY u.id;
```

## Next Steps

After migration:
1. Test all functionality
2. Create additional user accounts if needed
3. Update your deployment configuration
4. Consider setting up regular database backups

