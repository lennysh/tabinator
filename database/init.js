const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'tabinator.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

/**
 * Initialize the database by creating tables if they don't exist
 */
function initDatabase() {
    return new Promise((resolve, reject) => {
        // Ensure data directory exists
        const dataDir = path.dirname(DB_PATH);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        const db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('Error opening database:', err);
                return reject(err);
            }
            console.log('Connected to SQLite database');
        });

        // Read and execute schema
        const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
        
        db.exec(schema, (err) => {
            if (err) {
                console.error('Error creating tables:', err);
                db.close();
                return reject(err);
            }
            console.log('Database schema initialized');
            
            // Migrate existing databases: add block_index column if it doesn't exist
            db.all("PRAGMA table_info(group_rules)", (err, cols) => {
                if (err) {
                    console.error('Error checking columns:', err);
                    resolve(db);
                    return;
                }
                
                const checkAndAddColumn = (tableName, columnName, defaultValue, afterColumn) => {
                    return new Promise((resolveCol, rejectCol) => {
                        db.all(`PRAGMA table_info(${tableName})`, (err, tableCols) => {
                            if (err) {
                                console.error(`Error checking ${tableName} columns:`, err);
                                return resolveCol();
                            }
                            if (tableCols && tableCols.length > 0) {
                                const hasColumn = tableCols.some(col => col.name === columnName);
                                if (!hasColumn) {
                                    const alterQuery = defaultValue !== null 
                                        ? `ALTER TABLE ${tableName} ADD COLUMN ${columnName} INTEGER NOT NULL DEFAULT ${defaultValue}`
                                        : `ALTER TABLE ${tableName} ADD COLUMN ${columnName} INTEGER DEFAULT ${defaultValue}`;
                                    db.run(alterQuery, (err) => {
                                        if (err) {
                                            console.error(`Error adding ${columnName} column:`, err);
                                        } else {
                                            console.log(`Added ${columnName} column to ${tableName} table`);
                                        }
                                        resolveCol();
                                    });
                                } else {
                                    resolveCol();
                                }
                            } else {
                                resolveCol();
                            }
                        });
                    });
                };
                
                // Check and add block_index if needed
                checkAndAddColumn('group_rules', 'block_index', 0, null).then(() => {
                    // Check and add warning_tabs_open if needed
                    checkAndAddColumn('user_config', 'warning_tabs_open', 20, null).then(() => {
                        // Migrate existing max_tabs_open values:
                        // 1. Copy old max_tabs_open to warning_tabs_open
                        // 2. Set max_tabs_open to 50 (if not already set to something else)
                        db.all("SELECT user_id, max_tabs_open FROM user_config", (err, rows) => {
                            if (err) {
                                console.error('Error checking user_config:', err);
                                resolve(db);
                                return;
                            }
                            if (rows && rows.length > 0) {
                                let updateCount = 0;
                                let processedCount = 0;
                                rows.forEach(row => {
                                    // Check current warning_tabs_open value
                                    db.get("SELECT warning_tabs_open FROM user_config WHERE user_id = ?", [row.user_id], (err, config) => {
                                        if (err) {
                                            console.error('Error checking config:', err);
                                            processedCount++;
                                            if (processedCount === rows.length) {
                                                if (updateCount > 0) {
                                                    console.log(`Migrated ${updateCount} user config records`);
                                                }
                                                resolve(db);
                                            }
                                            return;
                                        }
                                        // If warning_tabs_open is the default (20), migrate old max_tabs_open to it
                                        // and set max_tabs_open to 50
                                        if (config && config.warning_tabs_open === 20) {
                                            const warningValue = row.max_tabs_open || 20;
                                            const maxValue = 50; // Set max to 50
                                            db.run("UPDATE user_config SET warning_tabs_open = ?, max_tabs_open = ? WHERE user_id = ?", 
                                                [warningValue, maxValue, row.user_id], (err) => {
                                                if (err) {
                                                    console.error('Error updating user config:', err);
                                                } else {
                                                    updateCount++;
                                                }
                                                processedCount++;
                                                if (processedCount === rows.length) {
                                                    if (updateCount > 0) {
                                                        console.log(`Migrated ${updateCount} user config records`);
                                                    }
                                                    resolve(db);
                                                }
                                            });
                                        } else {
                                            processedCount++;
                                            if (processedCount === rows.length) {
                                                if (updateCount > 0) {
                                                    console.log(`Migrated ${updateCount} user config records`);
                                                }
                                                resolve(db);
                                            }
                                        }
                                    });
                                });
                                if (rows.length === 0) {
                                    resolve(db);
                                }
                            } else {
                                resolve(db);
                            }
                        });
                    });
                });
            });
        });
    });
}

/**
 * Get a database connection
 */
function getDatabase() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('Error opening database:', err);
                return reject(err);
            }
            resolve(db);
        });
    });
}

/**
 * Run a database query with promises
 */
function dbRun(db, query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function(err) {
            if (err) {
                reject(err);
            } else {
                resolve({ lastID: this.lastID, changes: this.changes });
            }
        });
    });
}

/**
 * Run a database query that returns a single row
 */
function dbGet(db, query, params = []) {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

/**
 * Run a database query that returns multiple rows
 */
function dbAll(db, query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

module.exports = {
    initDatabase,
    getDatabase,
    dbRun,
    dbGet,
    dbAll,
    DB_PATH
};

