const express = require('express');
const router = express.Router();
const { getDatabase, dbRun, dbGet, dbAll } = require('../database/init');
const { requireAuth } = require('../middleware/auth');
const { linkValidation, checkValidation } = require('../middleware/validation');

/**
 * GET /api/data
 * Get all data for the authenticated user (links, tags, groups, config)
 */
router.get('/data', requireAuth, async (req, res) => {
    const db = await getDatabase();
    try {
        const userId = req.userId;

        // Get user config
        const config = await dbGet(
            db,
            'SELECT max_tabs_open FROM user_config WHERE user_id = ?',
            [userId]
        );

        // Get all links with their tags and timestamps
        const links = await dbAll(
            db,
            `SELECT l.id, l.name, l.url, l.created_at, l.updated_at,
                    GROUP_CONCAT(t.name) as tags
             FROM links l
             LEFT JOIN link_tags lt ON l.id = lt.link_id
             LEFT JOIN tags t ON lt.tag_id = t.id
             WHERE l.user_id = ?
             GROUP BY l.id
             ORDER BY l.id`,
            [userId]
        );

        // Format links with tags as arrays
        const formattedLinks = links.map(link => ({
            name: link.name,
            url: link.url,
            tags: link.tags ? link.tags.split(',') : [],
            created_at: link.created_at,
            updated_at: link.updated_at
        }));

        // Get all groups with their rules (using block_index to preserve block structure)
        const groups = await dbAll(
            db,
            'SELECT id, name FROM groups WHERE user_id = ? ORDER BY name',
            [userId]
        );

        const formattedGroups = [];
        for (const group of groups) {
            const rules = await dbAll(
                db,
                'SELECT rule_type, match_type, match_value, block_index FROM group_rules WHERE group_id = ? ORDER BY rule_type, block_index, match_type',
                [group.id]
            );

            const include = [];
            const exclude = [];
            
            // Group rules by rule_type and block_index to preserve block structure
            const includeBlocks = {};
            const excludeBlocks = {};
            
            for (const rule of rules) {
                const blockKey = `${rule.rule_type}_${rule.block_index}`;
                const blocks = rule.rule_type === 'include' ? includeBlocks : excludeBlocks;
                
                if (!blocks[blockKey]) {
                    blocks[blockKey] = {};
                }
                
                if (!blocks[blockKey][rule.match_type]) {
                    blocks[blockKey][rule.match_type] = [];
                }
                blocks[blockKey][rule.match_type].push(rule.match_value);
            }
            
            // Convert include blocks to array
            const includeKeys = Object.keys(includeBlocks).sort((a, b) => {
                const aIndex = parseInt(a.split('_')[1]);
                const bIndex = parseInt(b.split('_')[1]);
                return aIndex - bIndex;
            });
            for (const key of includeKeys) {
                include.push(includeBlocks[key]);
            }
            
            // Convert exclude blocks to array
            const excludeKeys = Object.keys(excludeBlocks).sort((a, b) => {
                const aIndex = parseInt(a.split('_')[1]);
                const bIndex = parseInt(b.split('_')[1]);
                return aIndex - bIndex;
            });
            for (const key of excludeKeys) {
                exclude.push(excludeBlocks[key]);
            }

            formattedGroups.push({
                name: group.name,
                include: include.length > 0 ? include : [],
                exclude: exclude.length > 0 ? exclude : []
            });
        }

        res.json({
            config: config ? { max_tabs_open: config.max_tabs_open } : { max_tabs_open: 20 },
            groups: formattedGroups,
            links: formattedLinks
        });
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ error: 'Failed to fetch data' });
    } finally {
        db.close();
    }
});

/**
 * POST /api/links
 * Create a new link
 */
router.post('/links', requireAuth, linkValidation, checkValidation, async (req, res) => {
    const db = await getDatabase();
    try {
        const userId = req.userId;
        const { name, url, tags = [] } = req.body;

        // Check for duplicate URL
        const existing = await dbGet(
            db,
            'SELECT id FROM links WHERE user_id = ? AND url = ?',
            [userId, url]
        );

        if (existing) {
            return res.status(409).json({ error: 'A link with this URL already exists' });
        }

        // Insert link
        const linkResult = await dbRun(
            db,
            'INSERT INTO links (user_id, name, url) VALUES (?, ?, ?)',
            [userId, name, url]
        );

        const linkId = linkResult.lastID;

        // Handle tags
        if (tags && tags.length > 0) {
            for (const tagName of tags) {
                const sanitizedTag = tagName.trim().substring(0, 100);
                if (!sanitizedTag) continue;

                // Get or create tag
                let tag = await dbGet(
                    db,
                    'SELECT id FROM tags WHERE user_id = ? AND name = ?',
                    [userId, sanitizedTag]
                );

                if (!tag) {
                    const tagResult = await dbRun(
                        db,
                        'INSERT INTO tags (user_id, name) VALUES (?, ?)',
                        [userId, sanitizedTag]
                    );
                    tag = { id: tagResult.lastID };
                }

                // Link tag to link
                await dbRun(
                    db,
                    'INSERT OR IGNORE INTO link_tags (link_id, tag_id) VALUES (?, ?)',
                    [linkId, tag.id]
                );
            }
        }

        res.status(201).json({ name, url, tags });
    } catch (error) {
        console.error('Error creating link:', error);
        res.status(500).json({ error: 'Failed to create link' });
    } finally {
        db.close();
    }
});

/**
 * PUT /api/links
 * Update an existing link
 */
router.put('/links', requireAuth, async (req, res) => {
    const db = await getDatabase();
    try {
        const userId = req.userId;
        const { originalUrl, updatedLink } = req.body;

        if (!originalUrl || !updatedLink) {
            return res.status(400).json({ error: 'originalUrl and updatedLink are required' });
        }

        // Manual validation for nested structure
        const { name, url, tags = [] } = updatedLink;
        
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({ error: 'Name is required' });
        }
        if (name.length > 500) {
            return res.status(400).json({ error: 'Name must be less than 500 characters' });
        }
        
        if (!url || typeof url !== 'string' || url.trim().length === 0) {
            return res.status(400).json({ error: 'URL is required' });
        }
        if (url.length > 2000) {
            return res.status(400).json({ error: 'URL must be less than 2000 characters' });
        }
        
        // Validate URL format
        try {
            const urlObj = new URL(url);
            if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
                return res.status(400).json({ error: 'Invalid URL format' });
            }
        } catch (e) {
            return res.status(400).json({ error: 'Invalid URL format' });
        }
        
        // Validate tags
        if (!Array.isArray(tags)) {
            return res.status(400).json({ error: 'Tags must be an array' });
        }
        if (tags.length > 50) {
            return res.status(400).json({ error: 'Maximum 50 tags allowed' });
        }
        if (!tags.every(tag => typeof tag === 'string' && tag.length <= 100)) {
            return res.status(400).json({ error: 'Each tag must be a string with max 100 characters' });
        }
        
        // Sanitize inputs
        const sanitizedName = name.replace(/[<>]/g, '').trim().substring(0, 500);
        const sanitizedUrl = url.trim().substring(0, 2000);

        // Find the link
        const link = await dbGet(
            db,
            'SELECT id FROM links WHERE user_id = ? AND url = ?',
            [userId, originalUrl]
        );

        if (!link) {
            return res.status(404).json({ error: 'Link not found' });
        }

        // Check if new URL conflicts (if URL changed)
        if (sanitizedUrl !== originalUrl) {
            const conflict = await dbGet(
                db,
                'SELECT id FROM links WHERE user_id = ? AND url = ? AND id != ?',
                [userId, sanitizedUrl, link.id]
            );
            if (conflict) {
                return res.status(409).json({ error: 'A link with this URL already exists' });
            }
        }

        // Update link
        await dbRun(
            db,
            'UPDATE links SET name = ?, url = ? WHERE id = ?',
            [sanitizedName, sanitizedUrl, link.id]
        );

        // Remove all existing tags
        await dbRun(
            db,
            'DELETE FROM link_tags WHERE link_id = ?',
            [link.id]
        );

        // Add new tags
        if (tags && tags.length > 0) {
            for (const tagName of tags) {
                const sanitizedTag = tagName.trim().substring(0, 100);
                if (!sanitizedTag) continue;

                let tag = await dbGet(
                    db,
                    'SELECT id FROM tags WHERE user_id = ? AND name = ?',
                    [userId, sanitizedTag]
                );

                if (!tag) {
                    const tagResult = await dbRun(
                        db,
                        'INSERT INTO tags (user_id, name) VALUES (?, ?)',
                        [userId, sanitizedTag]
                    );
                    tag = { id: tagResult.lastID };
                }

                await dbRun(
                    db,
                    'INSERT OR IGNORE INTO link_tags (link_id, tag_id) VALUES (?, ?)',
                    [link.id, tag.id]
                );
            }
        }

        res.json({ name: sanitizedName, url: sanitizedUrl, tags });
    } catch (error) {
        console.error('Error updating link:', error);
        res.status(500).json({ error: 'Failed to update link' });
    } finally {
        db.close();
    }
});

/**
 * DELETE /api/links
 * Delete a link
 */
router.delete('/links', requireAuth, async (req, res) => {
    const db = await getDatabase();
    try {
        const userId = req.userId;
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        // Find and delete the link (CASCADE will handle tags)
        const link = await dbGet(
            db,
            'SELECT id FROM links WHERE user_id = ? AND url = ?',
            [userId, url]
        );

        if (!link) {
            return res.status(404).json({ error: 'Link not found' });
        }

        await dbRun(
            db,
            'DELETE FROM links WHERE id = ?',
            [link.id]
        );

        res.json({ message: 'Link deleted successfully' });
    } catch (error) {
        console.error('Error deleting link:', error);
        res.status(500).json({ error: 'Failed to delete link' });
    } finally {
        db.close();
    }
});

module.exports = router;

