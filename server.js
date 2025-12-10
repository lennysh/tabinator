const express = require('express');
const path = require('path');
const cors = require('cors');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const { initDatabase } = require('./database/init');
const authRoutes = require('./routes/auth');
const linksRoutes = require('./routes/links');
const groupsRoutes = require('./routes/groups');

const app = express();
const PORT = process.env.PORT || 8080;
const HTML_FILE_PATH = path.join(__dirname, 'app', 'index.html');

// --- Middleware ---

// CORS configuration - allow credentials for session cookies
app.use(cors({
    origin: process.env.CORS_ORIGIN || true, // Allow all origins in dev, set specific in production
    credentials: true
}));

// Parse JSON request bodies (needed before logging to see body)
app.use(express.json());

// Session configuration (needed before logging to see userId)
// Use SQLite store to persist sessions across server restarts
app.use(session({
    store: new SQLiteStore({
        db: 'sessions.db',
        dir: path.join(__dirname, 'data')
    }),
    secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // HTTPS only in production
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
}));

// Request logging middleware (runs AFTER session so we can see userId)
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
        const logData = {
            method: req.method,
            path: req.path,
            userId: req.session?.userId || 'not authenticated'
        };
        
        // Only log body for POST/PUT/PATCH requests and sanitize sensitive data
        if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
            const sanitizedBody = { ...req.body };
            // Don't log passwords
            if (sanitizedBody.password) sanitizedBody.password = '***';
            if (sanitizedBody.currentPassword) sanitizedBody.currentPassword = '***';
            if (sanitizedBody.newPassword) sanitizedBody.newPassword = '***';
            logData.body = sanitizedBody;
        }
        
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, logData);
    }
    next();
});

// Serve static files from the 'app' directory
app.use(express.static(path.join(__dirname, 'app')));
// Serve images directory
app.use('/images', express.static(path.join(__dirname, 'images')));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
});

// --- API Routes ---

app.use('/api/auth', authRoutes);
app.use('/api/groups', groupsRoutes);
app.use('/api', linksRoutes);

// --- Frontend Route ---

/**
 * GET /
 * Serves the main index.html file.
 */
app.get('/', (req, res) => {
    res.sendFile(HTML_FILE_PATH);
});

// --- Start Server ---

async function startServer() {
    try {
        // Initialize database
        await initDatabase();
        console.log('Database initialized');

        // Start server
        app.listen(PORT, () => {
            console.log(`Tabinator server running at http://localhost:${PORT}`);
            console.log(`\n⚠️  IMPORTANT: If this is your first run, execute 'npm run migrate' to migrate your YAML data!`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
