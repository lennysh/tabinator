const express = require('express');
const fs = require('fs');
const path = require('path');
const jsyaml = require('js-yaml');
const cors = require('cors');

const app = express();
const PORT = 8080;
const YAML_FILE_PATH = path.join(__dirname, 'app', 'links.yaml');
const HTML_FILE_PATH = path.join(__dirname, 'app', 'index.html');

// --- Middleware ---
// Enable CORS (Cross-Origin Resource Sharing)
app.use(cors());
// Parse JSON request bodies
app.use(express.json());
// Serve static files from the 'app' directory (for js-yaml.min.js, etc.)
app.use(express.static(path.join(__dirname, 'app')));

// --- Helper Functions ---

/**
 * Reads and parses the links.yaml file.
 * @returns {object} The parsed YAML data (or a default structure if file not found).
 */
function readYamlFile() {
    try {
        const fileContents = fs.readFileSync(YAML_FILE_PATH, 'utf8');
        return jsyaml.load(fileContents) || { groups: [], links: [] };
    } catch (e) {
        console.error("Error reading YAML file:", e.message);
        // If file doesn't exist, return a default structure
        if (e.code === 'ENOENT') {
            return { groups: [], links: [] };
        }
        throw e;
    }
}

/**
 * Writes data back to the links.yaml file.
 * @param {object} data The JavaScript object to write as YAML.
 */
function writeYamlFile(data) {
    try {
        const yamlString = jsyaml.dump(data, { indent: 2 });
        fs.writeFileSync(YAML_FILE_PATH, yamlString, 'utf8');
    } catch (e) {
        console.error("Error writing YAML file:", e.message);
        throw e;
    }
}

// --- API Endpoints ---

/**
 * GET /api/data
 * Fetches the complete data from links.yaml.
 */
app.get('/api/data', (req, res) => {
    try {
        const data = readYamlFile();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'Failed to read data.' });
    }
});

/**
 * POST /api/links
 * Adds a new link to the list.
 * Expects body: { name, url, tags: [] }
 */
app.post('/api/links', (req, res) => {
    try {
        const newLink = req.body;
        if (!newLink || !newLink.name || !newLink.url) {
            return res.status(400).json({ error: 'Invalid link data. "name" and "url" are required.' });
        }
        
        const data = readYamlFile();
        data.links = data.links || [];
        
        // Check for duplicates
        if (data.links.some(link => link.url === newLink.url)) {
            return res.status(409).json({ error: 'A link with this URL already exists.' });
        }
        
        data.links.push(newLink);
        writeYamlFile(data);
        
        res.status(201).json(newLink);
    } catch (e) {
        res.status(500).json({ error: 'Failed to add link.' });
    }
});

/**
 * PUT /api/links
 * Updates an existing link.
 * Expects body: { originalUrl: "...", updatedLink: { name, url, tags: [] } }
 */
app.put('/api/links', (req, res) => {
    try {
        const { originalUrl, updatedLink } = req.body;
        
        if (!originalUrl || !updatedLink || !updatedLink.name || !updatedLink.url) {
            return res.status(400).json({ error: 'Invalid update data. "originalUrl" and "updatedLink" are required.' });
        }

        const data = readYamlFile();
        data.links = data.links || [];
        
        const linkIndex = data.links.findIndex(link => link.url === originalUrl);
        
        if (linkIndex === -1) {
            return res.status(404).json({ error: 'Link to update not found.' });
        }
        
        // Replace the old link with the new one
        data.links[linkIndex] = updatedLink;
        writeYamlFile(data);
        
        res.status(200).json(updatedLink);
    } catch (e) {
        res.status(500).json({ error: 'Failed to update link.' });
    }
});

/**
 * DELETE /api/links
 * Deletes a link by its URL.
 * Expects body: { url: "..." }
 */
app.delete('/api/links', (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ error: '"url" is required to delete a link.' });
        }

        const data = readYamlFile();
        data.links = data.links || [];
        
        const originalLength = data.links.length;
        data.links = data.links.filter(link => link.url !== url);
        
        if (data.links.length === originalLength) {
            return res.status(404).json({ error: 'Link to delete not found.' });
        }
        
        writeYamlFile(data);
        res.status(200).json({ message: 'Link deleted successfully.' });
    } catch (e) {
        res.status(500).json({ error: 'Failed to delete link.' });
    }
});

// --- Frontend Route ---

/**
 * GET /
 * Serves the main index.html file.
 */
app.get('/', (req, res) => {
    res.sendFile(HTML_FILE_PATH);
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`Tabinator server running at http://localhost:${PORT}`);
    // Ensure the app directory and links.yaml file exist
    if (!fs.existsSync(path.join(__dirname, 'app'))) {
        fs.mkdirSync(path.join(__dirname, 'app'));
    }
    if (!fs.existsSync(YAML_FILE_PATH)) {
        writeYamlFile({ groups: [], links: [] });
        console.log(`Created empty 'links.yaml' at ${YAML_FILE_PATH}`);
    }
});
