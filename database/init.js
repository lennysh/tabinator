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
                if (cols && cols.length > 0) {
                    const hasBlockIndex = cols.some(col => col.name === 'block_index');
                    if (!hasBlockIndex) {
                        db.run("ALTER TABLE group_rules ADD COLUMN block_index INTEGER NOT NULL DEFAULT 0", (err) => {
                            if (err) {
                                console.error('Error adding block_index column:', err);
                            } else {
                                console.log('Added block_index column to group_rules table');
                            }
                            resolve(db);
                        });
                    } else {
                        resolve(db);
                    }
                } else {
                    resolve(db);
                }
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

