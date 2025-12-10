const express = require('express');
const router = express.Router();
const { getDatabase, dbRun, dbGet, dbAll } = require('../database/init');
const { requireAuth } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

/**
 * GET /api/groups
 * Get all groups for the authenticated user
 */
router.get('/', requireAuth, async (req, res) => {
    const db = await getDatabase();
    try {
        const userId = req.userId;

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
                id: group.id,
                name: group.name,
                include: include,
                exclude: exclude
            });
        }

        res.json(formattedGroups);
    } catch (error) {
        console.error('Error fetching groups:', error);
        res.status(500).json({ error: 'Failed to fetch groups' });
    } finally {
        db.close();
    }
});

/**
 * POST /api/groups
 * Create a new group
 */
router.post('/', requireAuth, [
    body('name')
        .trim()
        .notEmpty().withMessage('Group name is required')
        .isLength({ max: 100 }).withMessage('Group name must be less than 100 characters'),
    body('include').optional().isArray(),
    body('exclude').optional().isArray()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const db = await getDatabase();
    try {
        const userId = req.userId;
        const { name, include = [], exclude = [] } = req.body;

        // Check for duplicate name
        const existing = await dbGet(
            db,
            'SELECT id FROM groups WHERE user_id = ? AND name = ?',
            [userId, name]
        );

        if (existing) {
            return res.status(409).json({ error: 'A group with this name already exists' });
        }

        // Create group
        const groupResult = await dbRun(
            db,
            'INSERT INTO groups (user_id, name) VALUES (?, ?)',
            [userId, name]
        );

        const groupId = groupResult.lastID;

        // Add include rules with block_index
        for (let blockIndex = 0; blockIndex < include.length; blockIndex++) {
            const block = include[blockIndex];
            if (block.tags && Array.isArray(block.tags)) {
                for (const value of block.tags) {
                    await dbRun(
                        db,
                        'INSERT INTO group_rules (group_id, rule_type, match_type, match_value, block_index) VALUES (?, ?, ?, ?, ?)',
                        [groupId, 'include', 'tags', value, blockIndex]
                    );
                }
            }
            if (block.names && Array.isArray(block.names)) {
                for (const value of block.names) {
                    await dbRun(
                        db,
                        'INSERT INTO group_rules (group_id, rule_type, match_type, match_value, block_index) VALUES (?, ?, ?, ?, ?)',
                        [groupId, 'include', 'names', value, blockIndex]
                    );
                }
            }
            if (block.urls && Array.isArray(block.urls)) {
                for (const value of block.urls) {
                    await dbRun(
                        db,
                        'INSERT INTO group_rules (group_id, rule_type, match_type, match_value, block_index) VALUES (?, ?, ?, ?, ?)',
                        [groupId, 'include', 'urls', value, blockIndex]
                    );
                }
            }
        }

        // Add exclude rules with block_index
        for (let blockIndex = 0; blockIndex < exclude.length; blockIndex++) {
            const block = exclude[blockIndex];
            if (block.tags && Array.isArray(block.tags)) {
                for (const value of block.tags) {
                    await dbRun(
                        db,
                        'INSERT INTO group_rules (group_id, rule_type, match_type, match_value, block_index) VALUES (?, ?, ?, ?, ?)',
                        [groupId, 'exclude', 'tags', value, blockIndex]
                    );
                }
            }
            if (block.names && Array.isArray(block.names)) {
                for (const value of block.names) {
                    await dbRun(
                        db,
                        'INSERT INTO group_rules (group_id, rule_type, match_type, match_value, block_index) VALUES (?, ?, ?, ?, ?)',
                        [groupId, 'exclude', 'names', value, blockIndex]
                    );
                }
            }
            if (block.urls && Array.isArray(block.urls)) {
                for (const value of block.urls) {
                    await dbRun(
                        db,
                        'INSERT INTO group_rules (group_id, rule_type, match_type, match_value, block_index) VALUES (?, ?, ?, ?, ?)',
                        [groupId, 'exclude', 'urls', value, blockIndex]
                    );
                }
            }
        }

        res.status(201).json({ id: groupId, name, include, exclude });
    } catch (error) {
        console.error('Error creating group:', error);
        res.status(500).json({ error: 'Failed to create group' });
    } finally {
        db.close();
    }
});

/**
 * PUT /api/groups/:id
 * Update an existing group
 */
router.put('/:id', requireAuth, [
    body('name')
        .trim()
        .notEmpty().withMessage('Group name is required')
        .isLength({ max: 100 }).withMessage('Group name must be less than 100 characters'),
    body('include').optional().isArray(),
    body('exclude').optional().isArray()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const db = await getDatabase();
    try {
        const userId = req.userId;
        const groupId = parseInt(req.params.id);
        const { name, include = [], exclude = [] } = req.body;

        // Verify group exists and belongs to user
        const group = await dbGet(
            db,
            'SELECT id FROM groups WHERE id = ? AND user_id = ?',
            [groupId, userId]
        );

        if (!group) {
            return res.status(404).json({ error: 'Group not found' });
        }

        // Check for duplicate name (excluding current group)
        const existing = await dbGet(
            db,
            'SELECT id FROM groups WHERE user_id = ? AND name = ? AND id != ?',
            [userId, name, groupId]
        );

        if (existing) {
            return res.status(409).json({ error: 'A group with this name already exists' });
        }

        // Update group name
        await dbRun(
            db,
            'UPDATE groups SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [name, groupId]
        );

        // Delete all existing rules
        await dbRun(
            db,
            'DELETE FROM group_rules WHERE group_id = ?',
            [groupId]
        );

        // Add new include rules with block_index
        for (let blockIndex = 0; blockIndex < include.length; blockIndex++) {
            const block = include[blockIndex];
            if (block.tags && Array.isArray(block.tags)) {
                for (const value of block.tags) {
                    await dbRun(
                        db,
                        'INSERT INTO group_rules (group_id, rule_type, match_type, match_value, block_index) VALUES (?, ?, ?, ?, ?)',
                        [groupId, 'include', 'tags', value, blockIndex]
                    );
                }
            }
            if (block.names && Array.isArray(block.names)) {
                for (const value of block.names) {
                    await dbRun(
                        db,
                        'INSERT INTO group_rules (group_id, rule_type, match_type, match_value, block_index) VALUES (?, ?, ?, ?, ?)',
                        [groupId, 'include', 'names', value, blockIndex]
                    );
                }
            }
            if (block.urls && Array.isArray(block.urls)) {
                for (const value of block.urls) {
                    await dbRun(
                        db,
                        'INSERT INTO group_rules (group_id, rule_type, match_type, match_value, block_index) VALUES (?, ?, ?, ?, ?)',
                        [groupId, 'include', 'urls', value, blockIndex]
                    );
                }
            }
        }

        // Add new exclude rules with block_index
        for (let blockIndex = 0; blockIndex < exclude.length; blockIndex++) {
            const block = exclude[blockIndex];
            if (block.tags && Array.isArray(block.tags)) {
                for (const value of block.tags) {
                    await dbRun(
                        db,
                        'INSERT INTO group_rules (group_id, rule_type, match_type, match_value, block_index) VALUES (?, ?, ?, ?, ?)',
                        [groupId, 'exclude', 'tags', value, blockIndex]
                    );
                }
            }
            if (block.names && Array.isArray(block.names)) {
                for (const value of block.names) {
                    await dbRun(
                        db,
                        'INSERT INTO group_rules (group_id, rule_type, match_type, match_value, block_index) VALUES (?, ?, ?, ?, ?)',
                        [groupId, 'exclude', 'names', value, blockIndex]
                    );
                }
            }
            if (block.urls && Array.isArray(block.urls)) {
                for (const value of block.urls) {
                    await dbRun(
                        db,
                        'INSERT INTO group_rules (group_id, rule_type, match_type, match_value, block_index) VALUES (?, ?, ?, ?, ?)',
                        [groupId, 'exclude', 'urls', value, blockIndex]
                    );
                }
            }
        }

        res.json({ id: groupId, name, include, exclude });
    } catch (error) {
        console.error('Error updating group:', error);
        res.status(500).json({ error: 'Failed to update group' });
    } finally {
        db.close();
    }
});

/**
 * DELETE /api/groups/:id
 * Delete a group
 */
router.delete('/:id', requireAuth, async (req, res) => {
    const db = await getDatabase();
    try {
        const userId = req.userId;
        const groupId = parseInt(req.params.id);

        // Verify group exists and belongs to user
        const group = await dbGet(
            db,
            'SELECT id FROM groups WHERE id = ? AND user_id = ?',
            [groupId, userId]
        );

        if (!group) {
            return res.status(404).json({ error: 'Group not found' });
        }

        // Delete group (CASCADE will handle rules)
        await dbRun(
            db,
            'DELETE FROM groups WHERE id = ?',
            [groupId]
        );

        res.json({ message: 'Group deleted successfully' });
    } catch (error) {
        console.error('Error deleting group:', error);
        res.status(500).json({ error: 'Failed to delete group' });
    } finally {
        db.close();
    }
});

module.exports = router;

