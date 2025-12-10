const { body, validationResult } = require('express-validator');

/**
 * Sanitize string input to prevent XSS
 */
function sanitizeString(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/[<>]/g, '') // Remove < and >
        .trim()
        .substring(0, 1000); // Limit length
}

/**
 * Validate URL
 */
function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
        return false;
    }
}

/**
 * Validation rules for link creation/update
 */
const linkValidation = [
    body('name')
        .trim()
        .notEmpty().withMessage('Name is required')
        .isLength({ max: 500 }).withMessage('Name must be less than 500 characters')
        .customSanitizer(sanitizeString),
    body('url')
        .trim()
        .notEmpty().withMessage('URL is required')
        .isLength({ max: 2000 }).withMessage('URL must be less than 2000 characters')
        .custom((value) => {
            if (!isValidUrl(value)) {
                throw new Error('Invalid URL format');
            }
            return true;
        }),
    body('tags')
        .optional()
        .isArray().withMessage('Tags must be an array')
        .custom((tags) => {
            if (tags.length > 50) {
                throw new Error('Maximum 50 tags allowed');
            }
            return tags.every(tag => typeof tag === 'string' && tag.length <= 100);
        })
];

/**
 * Validation rules for user registration
 */
const registerValidation = [
    body('username')
        .trim()
        .notEmpty().withMessage('Username is required')
        .isLength({ min: 3, max: 50 }).withMessage('Username must be between 3 and 50 characters')
        .matches(/^[a-zA-Z0-9_-]+$/).withMessage('Username can only contain letters, numbers, underscores, and hyphens')
        .customSanitizer(sanitizeString),
    body('email')
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Invalid email format')
        .normalizeEmail(),
    body('password')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number')
];

/**
 * Validation rules for user login
 */
const loginValidation = [
    body('username')
        .trim()
        .notEmpty().withMessage('Username is required')
        .customSanitizer(sanitizeString),
    body('password')
        .notEmpty().withMessage('Password is required')
];

/**
 * Validation rules for password change
 */
const changePasswordValidation = [
    body('currentPassword')
        .notEmpty().withMessage('Current password is required'),
    body('newPassword')
        .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('New password must contain at least one uppercase letter, one lowercase letter, and one number'),
    body('confirmPassword')
        .custom((value, { req }) => {
            if (value !== req.body.newPassword) {
                throw new Error('Passwords do not match');
            }
            return true;
        })
];

/**
 * Middleware to check validation results
 */
function checkValidation(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            error: 'Validation failed',
            details: errors.array()
        });
    }
    next();
}

module.exports = {
    linkValidation,
    registerValidation,
    loginValidation,
    changePasswordValidation,
    checkValidation,
    sanitizeString,
    isValidUrl
};

