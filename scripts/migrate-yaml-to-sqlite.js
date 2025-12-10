const fs = require('fs');
const path = require('path');
const jsyaml = require('js-yaml');
const bcrypt = require('bcrypt');
const { initDatabase, dbRun, dbGet, dbAll } = require('../database/init');

const YAML_FILE_PATH = path.join(__dirname, '..', 'app', 'links.yaml');

/**
 * Migration script to convert existing YAML data to SQLite database
 * This will create a default user and migrate all links to that user
 */
async function migrate() {
    console.log('Starting migration from YAML to SQLite...');

    // Initialize database
    const db = await initDatabase();

    try {
        // Check if YAML file exists
        if (!fs.existsSync(YAML_FILE_PATH)) {
            console.log('No YAML file found. Creating default user only.');
            await createDefaultUser(db);
            db.close();
            return;
        }

        // Read YAML file
        const yamlContent = fs.readFileSync(YAML_FILE_PATH, 'utf8');
        const data = jsyaml.load(yamlContent) || { groups: [], links: [] };

        // Create default user
        const defaultUsername = 'admin';
        const defaultPassword = 'admin'; // User should change this!
        const passwordHash = await bcrypt.hash(defaultPassword, 10);
        
        const userResult = await dbRun(
            db,
            'INSERT OR IGNORE INTO users (username, email, password_hash) VALUES (?, ?, ?)',
            [defaultUsername, `${defaultUsername}@tabinator.local`, passwordHash]
        );

        let userId;
        if (userResult.changes === 0) {
            // User already exists, get their ID
            const user = await dbGet(db, 'SELECT id FROM users WHERE username = ?', [defaultUsername]);
            userId = user.id;
        } else {
            userId = userResult.lastID;
        }

        console.log(`Using user ID: ${userId}`);

        // Migrate config
        if (data.config && data.config.max_tabs_open) {
            await dbRun(
                db,
                'INSERT OR REPLACE INTO user_config (user_id, max_tabs_open) VALUES (?, ?)',
                [userId, data.config.max_tabs_open]
            );
            console.log(`Migrated config: max_tabs_open = ${data.config.max_tabs_open}`);
        }

        // Migrate links
        if (data.links && Array.isArray(data.links)) {
            console.log(`Migrating ${data.links.length} links...`);
            
            for (let i = 0; i < data.links.length; i++) {
                const link = data.links[i];
                
                // Insert link
                const linkResult = await dbRun(
                    db,
                    'INSERT INTO links (user_id, name, url) VALUES (?, ?, ?)',
                    [userId, link.name || 'Untitled', link.url || '']
                );
                
                const linkId = linkResult.lastID;

                // Migrate tags
                if (link.tags && Array.isArray(link.tags)) {
                    for (const tagName of link.tags) {
                        // Get or create tag
                        let tag = await dbGet(
                            db,
                            'SELECT id FROM tags WHERE user_id = ? AND name = ?',
                            [userId, tagName]
                        );

                        if (!tag) {
                            const tagResult = await dbRun(
                                db,
                                'INSERT INTO tags (user_id, name) VALUES (?, ?)',
                                [userId, tagName]
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
            }
            console.log(`Migrated ${data.links.length} links successfully`);
        }

        // Migrate groups
        if (data.groups && Array.isArray(data.groups)) {
            console.log(`Migrating ${data.groups.length} groups...`);
            
            for (const group of data.groups) {
                if (!group.name) continue;

                // Insert group
                const groupResult = await dbRun(
                    db,
                    'INSERT INTO groups (user_id, name) VALUES (?, ?)',
                    [userId, group.name]
                );
                const groupId = groupResult.lastID;

                // Migrate include rules
                if (group.include && Array.isArray(group.include)) {
                    for (const includeBlock of group.include) {
                        if (includeBlock.tags && Array.isArray(includeBlock.tags)) {
                            for (const tagValue of includeBlock.tags) {
                                await dbRun(
                                    db,
                                    'INSERT INTO group_rules (group_id, rule_type, match_type, match_value) VALUES (?, ?, ?, ?)',
                                    [groupId, 'include', 'tags', tagValue]
                                );
                            }
                        }
                        if (includeBlock.names && Array.isArray(includeBlock.names)) {
                            for (const nameValue of includeBlock.names) {
                                await dbRun(
                                    db,
                                    'INSERT INTO group_rules (group_id, rule_type, match_type, match_value) VALUES (?, ?, ?, ?)',
                                    [groupId, 'include', 'names', nameValue]
                                );
                            }
                        }
                        if (includeBlock.urls && Array.isArray(includeBlock.urls)) {
                            for (const urlValue of includeBlock.urls) {
                                await dbRun(
                                    db,
                                    'INSERT INTO group_rules (group_id, rule_type, match_type, match_value) VALUES (?, ?, ?, ?)',
                                    [groupId, 'include', 'urls', urlValue]
                                );
                            }
                        }
                    }
                }

                // Migrate exclude rules
                if (group.exclude && Array.isArray(group.exclude)) {
                    for (const excludeBlock of group.exclude) {
                        if (excludeBlock.tags && Array.isArray(excludeBlock.tags)) {
                            for (const tagValue of excludeBlock.tags) {
                                await dbRun(
                                    db,
                                    'INSERT INTO group_rules (group_id, rule_type, match_type, match_value) VALUES (?, ?, ?, ?)',
                                    [groupId, 'exclude', 'tags', tagValue]
                                );
                            }
                        }
                        if (excludeBlock.names && Array.isArray(excludeBlock.names)) {
                            for (const nameValue of excludeBlock.names) {
                                await dbRun(
                                    db,
                                    'INSERT INTO group_rules (group_id, rule_type, match_type, match_value) VALUES (?, ?, ?, ?)',
                                    [groupId, 'exclude', 'names', nameValue]
                                );
                            }
                        }
                        if (excludeBlock.urls && Array.isArray(excludeBlock.urls)) {
                            for (const urlValue of excludeBlock.urls) {
                                await dbRun(
                                    db,
                                    'INSERT INTO group_rules (group_id, rule_type, match_type, match_value) VALUES (?, ?, ?, ?)',
                                    [groupId, 'exclude', 'urls', urlValue]
                                );
                            }
                        }
                    }
                }
            }
            console.log(`Migrated ${data.groups.length} groups successfully`);
        }

        console.log('\n✅ Migration completed successfully!');
        console.log(`\nDefault credentials:`);
        console.log(`  Username: ${defaultUsername}`);
        console.log(`  Password: ${defaultPassword}`);
        console.log(`\n⚠️  IMPORTANT: Please change the default password after first login!`);

    } catch (error) {
        console.error('Migration error:', error);
        throw error;
    } finally {
        db.close();
    }
}

async function createDefaultUser(db) {
    const defaultUsername = 'admin';
    const defaultPassword = 'admin';
    const passwordHash = await bcrypt.hash(defaultPassword, 10);
    
    await dbRun(
        db,
        'INSERT OR IGNORE INTO users (username, email, password_hash) VALUES (?, ?, ?)',
        [defaultUsername, `${defaultUsername}@tabinator.local`, passwordHash]
    );
    
    console.log(`\nDefault user created:`);
    console.log(`  Username: ${defaultUsername}`);
    console.log(`  Password: ${defaultPassword}`);
    console.log(`\n⚠️  IMPORTANT: Please change the default password after first login!`);
}

// Run migration if called directly
if (require.main === module) {
    migrate().catch((error) => {
        console.error('Migration failed:', error);
        process.exit(1);
    });
}

module.exports = { migrate };

