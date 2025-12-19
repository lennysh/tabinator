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
            'INSERT INTO user_config (user_id, warning_tabs_open, max_tabs_open) VALUES (?, ?, ?)',
            [result.lastID, 20, 50]
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

        // Find user by username OR email
        const user = await dbGet(
            db,
            'SELECT id, username, email, password_hash FROM users WHERE username = ? OR email = ?',
            [username, username]
        );

        if (!user) {
            return res.status(401).json({ error: 'Invalid username/email or password' });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid username/email or password' });
        }

        // Set session
        req.session.userId = user.id;
        req.session.username = user.username;
        
        // Save session explicitly before sending response
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) {
                    console.error('Error saving session:', err);
                    return reject(err);
                }
                resolve();
            });
        });

        res.json({ 
            message: 'Login successful',
            user: {
                id: user.id,
                username: user.username,
                email: user.email
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
router.get('/me', async (req, res) => {
    if (req.session && req.session.userId) {
        const db = await getDatabase();
        try {
            // Get full user profile including email
            const user = await dbGet(
                db,
                'SELECT id, username, email FROM users WHERE id = ?',
                [req.session.userId]
            );
            
            if (user) {
                res.json({
                    authenticated: true,
                    user: {
                        id: user.id,
                        username: user.username,
                        email: user.email
                    }
                });
            } else {
                res.json({ authenticated: false });
            }
        } catch (error) {
            console.error('Error fetching user profile:', error);
            res.status(500).json({ error: 'Failed to fetch user profile' });
        } finally {
            db.close();
        }
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

/**
 * GET /api/auth/profile
 * Get user profile (email, username, config)
 */
router.get('/profile', requireAuth, async (req, res) => {
    const db = await getDatabase();
    try {
        const userId = req.userId;
        
        // Get user info
        const user = await dbGet(
            db,
            'SELECT id, username, email FROM users WHERE id = ?',
            [userId]
        );
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Get user config
        const config = await dbGet(
            db,
            'SELECT warning_tabs_open, max_tabs_open FROM user_config WHERE user_id = ?',
            [userId]
        );
        
        res.json({
            user: {
                id: user.id,
                username: user.username,
                email: user.email
            },
            config: {
                warning_tabs_open: config ? (config.warning_tabs_open ?? 20) : 20,
                max_tabs_open: config ? (config.max_tabs_open ?? 50) : 50
            }
        });
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    } finally {
        db.close();
    }
});

/**
 * PUT /api/auth/profile
 * Update user email
 */
router.put('/profile', requireAuth, async (req, res) => {
    const db = await getDatabase();
    try {
        const userId = req.userId;
        const { email } = req.body;
        
        // Validate email
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: 'Valid email is required' });
        }
        
        // Check if email is already taken by another user
        const existingUser = await dbGet(
            db,
            'SELECT id FROM users WHERE email = ? AND id != ?',
            [email, userId]
        );
        
        if (existingUser) {
            return res.status(409).json({ error: 'Email already in use' });
        }
        
        // Update email
        await dbRun(
            db,
            'UPDATE users SET email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [email, userId]
        );
        
        res.json({ message: 'Email updated successfully', email });
    } catch (error) {
        console.error('Error updating email:', error);
        res.status(500).json({ error: 'Failed to update email' });
    } finally {
        db.close();
    }
});

/**
 * PUT /api/user/config
 * Update user config (warning_tabs_open, max_tabs_open)
 */
router.put('/config', requireAuth, async (req, res) => {
    const db = await getDatabase();
    try {
        const userId = req.userId;
        const { warning_tabs_open, max_tabs_open } = req.body;
        
        // Validate warning_tabs_open (must be > 0)
        const warningTabs = parseInt(warning_tabs_open, 10);
        if (isNaN(warningTabs) || warningTabs < 1 || warningTabs > 1000) {
            return res.status(400).json({ error: 'warning_tabs_open must be between 1 and 1000' });
        }
        
        // Validate max_tabs_open (0 = no limit, otherwise must be >= warning_tabs_open)
        const maxTabs = parseInt(max_tabs_open, 10);
        if (isNaN(maxTabs) || maxTabs < 0 || maxTabs > 1000) {
            return res.status(400).json({ error: 'max_tabs_open must be between 0 and 1000 (0 = no limit)' });
        }
        
        // Warning cannot be above MAX unless MAX = 0 (no limit)
        if (maxTabs > 0 && warningTabs > maxTabs) {
            return res.status(400).json({ error: 'warning_tabs_open cannot be above max_tabs_open (unless max_tabs_open is 0 for no limit)' });
        }
        
        // Update or insert config
        await dbRun(
            db,
            'INSERT OR REPLACE INTO user_config (user_id, warning_tabs_open, max_tabs_open, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
            [userId, warningTabs, maxTabs]
        );
        
        res.json({ 
            message: 'Config updated successfully', 
            warning_tabs_open: warningTabs,
            max_tabs_open: maxTabs 
        });
    } catch (error) {
        console.error('Error updating config:', error);
        res.status(500).json({ error: 'Failed to update config' });
    } finally {
        db.close();
    }
});

module.exports = router;

