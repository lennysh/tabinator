const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { getDatabase, dbRun, dbGet } = require('../database/init');
const { registerValidation, loginValidation, changePasswordValidation, checkValidation } = require('../middleware/validation');
const { requireAuth } = require('../middleware/auth');

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', registerValidation, checkValidation, async (req, res) => {
    const db = await getDatabase();
    try {
        const { username, email, password } = req.body;

        // Check if username exists
        const existingUser = await dbGet(
            db,
            'SELECT id FROM users WHERE username = ? OR email = ?',
            [username, email]
        );

        if (existingUser) {
            return res.status(409).json({ error: 'Username or email already exists' });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create user
        const result = await dbRun(
            db,
            'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
            [username, email, passwordHash]
        );

        // Create default config
        await dbRun(
            db,
            'INSERT INTO user_config (user_id, max_tabs_open) VALUES (?, ?)',
            [result.lastID, 20]
        );

        res.status(201).json({ 
            message: 'User created successfully',
            userId: result.lastID
        });
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ error: 'Failed to register user' });
    } finally {
        db.close();
    }
});

/**
 * POST /api/auth/login
 * Login user
 */
router.post('/login', loginValidation, checkValidation, async (req, res) => {
    const db = await getDatabase();
    try {
        const { username, password } = req.body;

        // Find user
        const user = await dbGet(
            db,
            'SELECT id, username, password_hash FROM users WHERE username = ?',
            [username]
        );

        if (!user) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Set session
        req.session.userId = user.id;
        req.session.username = user.username;

        res.json({ 
            message: 'Login successful',
            user: {
                id: user.id,
                username: user.username
            }
        });
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).json({ error: 'Failed to login' });
    } finally {
        db.close();
    }
});

/**
 * POST /api/auth/logout
 * Logout user
 */
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to logout' });
        }
        res.json({ message: 'Logout successful' });
    });
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({
            authenticated: true,
            user: {
                id: req.session.userId,
                username: req.session.username
            }
        });
    } else {
        res.json({ authenticated: false });
    }
});

/**
 * POST /api/auth/change-password
 * Change user password
 */
router.post('/change-password', requireAuth, changePasswordValidation, checkValidation, async (req, res) => {
    const db = await getDatabase();
    try {
        const userId = req.userId;
        const { currentPassword, newPassword } = req.body;

        // Get current user
        const user = await dbGet(
            db,
            'SELECT password_hash FROM users WHERE id = ?',
            [userId]
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Verify current password
        const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        // Hash new password
        const newPasswordHash = await bcrypt.hash(newPassword, 10);

        // Update password
        await dbRun(
            db,
            'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [newPasswordHash, userId]
        );

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({ error: 'Failed to change password' });
    } finally {
        db.close();
    }
});

module.exports = router;

