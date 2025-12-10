/**
 * Authentication middleware
 */

/**
 * Middleware to require authentication
 */
function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        req.userId = req.session.userId;
        next();
    } else {
        res.status(401).json({ error: 'Authentication required' });
    }
}

module.exports = { requireAuth };

