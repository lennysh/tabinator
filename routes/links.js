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
            'SELECT warning_tabs_open, max_tabs_open FROM user_config WHERE user_id = ?',
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
            config: config ? { 
                warning_tabs_open: config.warning_tabs_open ?? 20,
                max_tabs_open: config.max_tabs_open ?? 50
            } : { 
                warning_tabs_open: 20,
                max_tabs_open: 50
            },
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

/**
 * GET /api/export
 * Export all user links in various formats (CSV, HTML bookmarks, Firefox JSON)
 */
router.get('/export', requireAuth, async (req, res) => {
    const db = await getDatabase();
    try {
        const userId = req.userId;
        const format = req.query.format || 'tabinator';
        
        console.log('Export request - format:', format, 'userId:', userId);

        // Get all links with their tags
        const links = await dbAll(
            db,
            `SELECT l.name, l.url, l.created_at, l.updated_at,
                    GROUP_CONCAT(t.name) as tags
             FROM links l
             LEFT JOIN link_tags lt ON l.id = lt.link_id
             LEFT JOIN tags t ON lt.tag_id = t.id
             WHERE l.user_id = ?
             GROUP BY l.id
             ORDER BY l.name`,
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

        let content = '';
        let contentType = 'text/csv';
        let filename = `tabinator-export-${new Date().toISOString().split('T')[0]}.csv`;

        if (format === 'tabinator') {
            // Tabinator JSON format - includes links, groups, and config
            console.log('Generating Tabinator JSON format');
            contentType = 'application/json';
            filename = `tabinator-export-${new Date().toISOString().split('T')[0]}.json`;
            
            // Get user config
            const config = await dbGet(
                db,
                'SELECT warning_tabs_open, max_tabs_open FROM user_config WHERE user_id = ?',
                [userId]
            );

            // Get all groups with their rules
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
                
                const include = [];
                const exclude = [];
                
                const includeKeys = Object.keys(includeBlocks).sort((a, b) => {
                    const aIndex = parseInt(a.split('_')[1]);
                    const bIndex = parseInt(b.split('_')[1]);
                    return aIndex - bIndex;
                });
                for (const key of includeKeys) {
                    include.push(includeBlocks[key]);
                }
                
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

            const tabinatorData = {
                version: '1.0',
                exported_at: new Date().toISOString(),
                config: config ? { 
                    warning_tabs_open: config.warning_tabs_open ?? 20,
                    max_tabs_open: config.max_tabs_open ?? 50
                } : { 
                    warning_tabs_open: 20,
                    max_tabs_open: 50
                },
                groups: formattedGroups,
                links: formattedLinks
            };

            content = JSON.stringify(tabinatorData, null, 2);
        } else if (format === 'csv') {
            // CSV format
            const csvRows = ['name,url,tags,created_at,updated_at'];

            // Escape CSV fields (handle commas, quotes, newlines)
            const escapeCsv = (field) => {
                if (!field) return '';
                const str = String(field);
                // If contains comma, quote, or newline, wrap in quotes and escape quotes
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            };

            for (const link of formattedLinks) {
                const name = escapeCsv(link.name);
                const url = escapeCsv(link.url);
                const tags = escapeCsv(Array.isArray(link.tags) ? link.tags.join(',') : (link.tags || ''));
                const created_at = escapeCsv(link.created_at || '');
                const updated_at = escapeCsv(link.updated_at || '');

                csvRows.push(`${name},${url},${tags},${created_at},${updated_at}`);
            }

            content = csvRows.join('\n');
        } else if (format === 'firefox') {
            // Firefox JSON format
            console.log('Generating Firefox JSON format');
            contentType = 'application/json';
            filename = `tabinator-export-${new Date().toISOString().split('T')[0]}.json`;
            
            const firefoxBookmarks = {
                title: 'Tabinator Bookmarks',
                id: 1,
                dateAdded: Date.now(),
                lastModified: Date.now(),
                type: 'text/x-moz-place-container',
                root: 'placesRoot',
            children: formattedLinks.map((link, index) => {
                const addDate = link.created_at ? new Date(link.created_at).getTime() : Date.now();
                return {
                    title: link.name || 'Untitled',
                    id: index + 2,
                    dateAdded: addDate,
                    lastModified: addDate,
                    type: 'text/x-moz-place',
                    uri: link.url,
                    tags: Array.isArray(link.tags) ? link.tags.join(',') : (link.tags || '')
                };
            })
            };

            content = JSON.stringify(firefoxBookmarks, null, 2);
        } else if (['chrome', 'edge', 'safari', 'opera', 'netscape'].includes(format)) {
            // HTML bookmark format (Netscape format)
            console.log('Generating HTML bookmark format for:', format);
            contentType = 'text/html';
            filename = `tabinator-export-${new Date().toISOString().split('T')[0]}.html`;
            
            const htmlParts = [
                '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
                '<!-- This is an automatically generated file.',
                '     It will be read and overwritten.',
                '     DO NOT EDIT! -->',
                '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
                '<TITLE>Bookmarks</TITLE>',
                '<H1>Bookmarks</H1>',
                '<DL><p>'
            ];

            for (const link of formattedLinks) {
                const addDate = link.created_at ? Math.floor(new Date(link.created_at).getTime() / 1000) : Math.floor(Date.now() / 1000);
                const tags = Array.isArray(link.tags) ? link.tags.join(',') : (link.tags || '');
                
                // Escape HTML entities
                const escapeHtml = (text) => {
                    if (!text) return '';
                    return String(text)
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&#039;');
                };

                const name = escapeHtml(link.name || 'Untitled');
                const url = escapeHtml(link.url);
                const tagsAttr = tags ? ` TAGS="${escapeHtml(tags)}"` : '';

                htmlParts.push(`    <DT><A HREF="${url}" ADD_DATE="${addDate}"${tagsAttr}>${name}</A>`);
            }

            htmlParts.push('</DL><p>');
            content = htmlParts.join('\n');
        } else {
            console.error('Unsupported export format:', format);
            return res.status(400).json({ error: 'Unsupported export format' });
        }

        console.log('Export completed - format:', format, 'contentType:', contentType, 'links count:', links.length);

        // Set headers for download
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(content);
    } catch (error) {
        console.error('Error exporting links:', error);
        res.status(500).json({ error: 'Failed to export links' });
    } finally {
        db.close();
    }
});

/**
 * POST /api/import
 * Import links from CSV (merge mode - updates existing, creates new)
 */
router.post('/import', requireAuth, async (req, res) => {
    const db = await getDatabase();
    try {
        const userId = req.userId;
        const { csvData, links, format, tabinatorData } = req.body;

        // Handle Tabinator JSON format (full backup/restore)
        if (format === 'tabinator' && tabinatorData) {
            console.log('Importing Tabinator JSON format');
            
            let imported = 0;
            let updated = 0;
            let skipped = 0;
            const errors = [];
            
            // Import config
            if (tabinatorData.config) {
                const warningTabs = tabinatorData.config.warning_tabs_open ?? 20;
                const maxTabs = tabinatorData.config.max_tabs_open ?? 50;
                await dbRun(
                    db,
                    `INSERT OR REPLACE INTO user_config (user_id, warning_tabs_open, max_tabs_open) VALUES (?, ?, ?)`,
                    [userId, warningTabs, maxTabs]
                );
            }
            
            // Import groups
            if (tabinatorData.groups && Array.isArray(tabinatorData.groups)) {
                for (const group of tabinatorData.groups) {
                    try {
                        // Check if group exists
                        const existingGroup = await dbGet(
                            db,
                            'SELECT id FROM groups WHERE user_id = ? AND name = ?',
                            [userId, group.name]
                        );
                        
                        let groupId;
                        if (existingGroup) {
                            // Update existing group
                            await dbRun(
                                db,
                                'UPDATE groups SET name = ? WHERE id = ?',
                                [group.name, existingGroup.id]
                            );
                            groupId = existingGroup.id;
                            
                            // Delete existing rules
                            await dbRun(
                                db,
                                'DELETE FROM group_rules WHERE group_id = ?',
                                [groupId]
                            );
                        } else {
                            // Create new group
                            const groupResult = await dbRun(
                                db,
                                'INSERT INTO groups (user_id, name) VALUES (?, ?)',
                                [userId, group.name]
                            );
                            groupId = groupResult.lastID;
                        }
                        
                        // Add include rules
                        if (group.include && Array.isArray(group.include)) {
                            for (let blockIndex = 0; blockIndex < group.include.length; blockIndex++) {
                                const block = group.include[blockIndex];
                                for (const matchType of ['tags', 'names', 'urls']) {
                                    if (block[matchType] && Array.isArray(block[matchType])) {
                                        for (const matchValue of block[matchType]) {
                                            await dbRun(
                                                db,
                                                'INSERT INTO group_rules (group_id, rule_type, match_type, match_value, block_index) VALUES (?, ?, ?, ?, ?)',
                                                [groupId, 'include', matchType, matchValue, blockIndex]
                                            );
                                        }
                                    }
                                }
                            }
                        }
                        
                        // Add exclude rules
                        if (group.exclude && Array.isArray(group.exclude)) {
                            for (let blockIndex = 0; blockIndex < group.exclude.length; blockIndex++) {
                                const block = group.exclude[blockIndex];
                                for (const matchType of ['tags', 'names', 'urls']) {
                                    if (block[matchType] && Array.isArray(block[matchType])) {
                                        for (const matchValue of block[matchType]) {
                                            await dbRun(
                                                db,
                                                'INSERT INTO group_rules (group_id, rule_type, match_type, match_value, block_index) VALUES (?, ?, ?, ?, ?)',
                                                [groupId, 'exclude', matchType, matchValue, blockIndex]
                                            );
                                        }
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        errors.push(`Group "${group.name}": ${error.message}`);
                        skipped++;
                    }
                }
            }
            
            // Import links (same logic as regular import)
            if (tabinatorData.links && Array.isArray(tabinatorData.links)) {
                for (let i = 0; i < tabinatorData.links.length; i++) {
                    try {
                        const link = tabinatorData.links[i];
                        const name = (link.name || '').trim() || 'Untitled';
                        const url = (link.url || '').trim();
                        const tags = Array.isArray(link.tags) ? link.tags : 
                                    (typeof link.tags === 'string' ? link.tags.split(',').map(t => t.trim()).filter(t => t) : []);

                        if (!url) {
                            skipped++;
                            continue;
                        }
                        
                        // Validate URL
                        try {
                            const urlObj = new URL(url);
                            if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
                                skipped++;
                                continue;
                            }
                        } catch (e) {
                            skipped++;
                            continue;
                        }

                        // Check if link exists
                        const existing = await dbGet(
                            db,
                            'SELECT id FROM links WHERE user_id = ? AND url = ?',
                            [userId, url]
                        );

                        let linkId;
                        if (existing) {
                            // Update existing link
                            await dbRun(
                                db,
                                'UPDATE links SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                                [name, existing.id]
                            );
                            linkId = existing.id;

                            // Remove existing tags
                            await dbRun(
                                db,
                                'DELETE FROM link_tags WHERE link_id = ?',
                                [linkId]
                            );

                            updated++;
                        } else {
                            // Create new link
                            const linkResult = await dbRun(
                                db,
                                'INSERT INTO links (user_id, name, url) VALUES (?, ?, ?)',
                                [userId, name, url]
                            );
                            linkId = linkResult.lastID;
                            imported++;
                        }

                        // Add tags
                        if (tags.length > 0) {
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
                    } catch (error) {
                        errors.push(`Link ${i + 1}: ${error.message}`);
                        skipped++;
                    }
                }
            }
            
            res.json({
                message: 'Tabinator import completed',
                imported,
                updated,
                skipped,
                errors: errors.length > 0 ? errors : undefined
            });
            
            return;
        }

        // Support both CSV and pre-parsed links array
        if (!csvData && (!links || !Array.isArray(links))) {
            return res.status(400).json({ error: 'CSV data or links array is required' });
        }

        // Simple CSV parser (handles quoted fields)
        const parseCsvLine = (line) => {
            const fields = [];
            let currentField = '';
            let inQuotes = false;

            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                const nextChar = line[i + 1];

                if (char === '"') {
                    if (inQuotes && nextChar === '"') {
                        // Escaped quote
                        currentField += '"';
                        i++; // Skip next quote
                    } else {
                        // Toggle quote state
                        inQuotes = !inQuotes;
                    }
                } else if (char === ',' && !inQuotes) {
                    fields.push(currentField);
                    currentField = '';
                } else {
                    currentField += char;
                }
            }
            fields.push(currentField); // Add last field
            return fields;
        };
        
        // Parse CSV if provided
        let lines = [];
        let nameIndex = -1;
        let urlIndex = -1;
        let tagsIndex = -1;
        
        if (csvData) {
            lines = csvData.split('\n').filter(line => line.trim());
            if (lines.length < 2) {
                return res.status(400).json({ error: 'CSV must have at least a header and one data row' });
            }

            // Parse header using CSV parser to handle quoted fields
            const header = parseCsvLine(lines[0]).map(h => h.trim());
            nameIndex = header.indexOf('name');
            urlIndex = header.indexOf('url');
            tagsIndex = header.indexOf('tags');

            if (nameIndex === -1 || urlIndex === -1) {
                return res.status(400).json({ error: 'CSV must have "name" and "url" columns' });
            }
        }

        let imported = 0;
        let updated = 0;
        let skipped = 0;
        const errors = [];
        
        // Process links array (from browser bookmark formats)
        if (links && Array.isArray(links)) {
            for (let i = 0; i < links.length; i++) {
                try {
                    const link = links[i];
                    const name = (link.name || '').trim() || 'Untitled';
                    const url = (link.url || '').trim();
                    const tags = Array.isArray(link.tags) ? link.tags : 
                                (typeof link.tags === 'string' ? link.tags.split(',').map(t => t.trim()).filter(t => t) : []);

                    if (!url) {
                        skipped++;
                        continue;
                    }
                    
                    // Validate URL
                    try {
                        const urlObj = new URL(url);
                        if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
                            skipped++;
                            continue;
                        }
                    } catch (e) {
                        skipped++;
                        continue;
                    }

                    // Check if link exists
                    const existing = await dbGet(
                        db,
                        'SELECT id FROM links WHERE user_id = ? AND url = ?',
                        [userId, url]
                    );

                    let linkId;
                    if (existing) {
                        // Update existing link
                        await dbRun(
                            db,
                            'UPDATE links SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                            [name, existing.id]
                        );
                        linkId = existing.id;

                        // Remove existing tags
                        await dbRun(
                            db,
                            'DELETE FROM link_tags WHERE link_id = ?',
                            [linkId]
                        );

                        updated++;
                    } else {
                        // Create new link
                        const linkResult = await dbRun(
                            db,
                            'INSERT INTO links (user_id, name, url) VALUES (?, ?, ?)',
                            [userId, name, url]
                        );
                        linkId = linkResult.lastID;
                        imported++;
                    }

                    // Add tags
                    if (tags.length > 0) {
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
                } catch (error) {
                    errors.push(`Link ${i + 1}: ${error.message}`);
                    skipped++;
                }
            }
        } else if (csvData) {
            // Process CSV format (existing logic)
            // Process each row (skip header)
            for (let i = 1; i < lines.length; i++) {
                try {
                    const fields = parseCsvLine(lines[i]);
                    if (fields.length < 2) {
                        skipped++;
                        continue;
                    }

                    const name = fields[nameIndex]?.trim() || 'Untitled';
                    const url = fields[urlIndex]?.trim() || '';
                    const tagsStr = fields[tagsIndex]?.trim() || '';
                    const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(t => t) : [];

                    if (!url) {
                        skipped++;
                        continue;
                    }

                // Check if link exists
                const existing = await dbGet(
                    db,
                    'SELECT id FROM links WHERE user_id = ? AND url = ?',
                    [userId, url]
                );

                let linkId;
                if (existing) {
                    // Update existing link
                    await dbRun(
                        db,
                        'UPDATE links SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                        [name, existing.id]
                    );
                    linkId = existing.id;

                    // Remove existing tags
                    await dbRun(
                        db,
                        'DELETE FROM link_tags WHERE link_id = ?',
                        [linkId]
                    );

                    updated++;
                } else {
                    // Create new link
                    const linkResult = await dbRun(
                        db,
                        'INSERT INTO links (user_id, name, url) VALUES (?, ?, ?)',
                        [userId, name, url]
                    );
                    linkId = linkResult.lastID;
                    imported++;
                }

                // Add tags
                if (tags.length > 0) {
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
                } catch (error) {
                    errors.push(`Row ${i + 1}: ${error.message}`);
                    skipped++;
                }
            }
        }

        res.json({
            message: 'Import completed',
            imported,
            updated,
            skipped,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        console.error('Error importing links:', error);
        res.status(500).json({ error: 'Failed to import links' });
    } finally {
        db.close();
    }
});

module.exports = router;

