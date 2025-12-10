// Tabinator Browser Extension
// Popup script for adding links

const DEFAULT_API_URL = 'http://localhost:8080';

// Load saved API URL
async function loadConfig() {
    const result = await chrome.storage.sync.get(['apiUrl']);
    const apiUrl = result.apiUrl || DEFAULT_API_URL;
    document.getElementById('api-url').value = apiUrl;
    return apiUrl;
}

// Save API URL
async function saveConfig() {
    const apiUrl = document.getElementById('api-url').value.trim();
    if (apiUrl) {
        await chrome.storage.sync.set({ apiUrl });
    }
}

// Show status message
function showStatus(message, type = 'info') {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
    
    if (type === 'success') {
        setTimeout(() => {
            statusEl.className = 'status';
            window.close();
        }, 1500);
    }
}

// Get current tab info
async function getCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
}

// Check if user is authenticated
async function checkAuth(apiUrl) {
    try {
        const response = await fetch(`${apiUrl}/api/auth/me`, {
            credentials: 'include'
        });
        const data = await response.json();
        return data.authenticated;
    } catch (error) {
        return false;
    }
}

// Add link to Tabinator
async function addLink(name, url, tags, apiUrl) {
    // Check authentication
    const authenticated = await checkAuth(apiUrl);
    if (!authenticated) {
        showStatus('Please login to Tabinator first in your browser', 'error');
        // Open Tabinator in new tab
        setTimeout(() => {
            chrome.tabs.create({ url: apiUrl });
        }, 2000);
        return false;
    }

    // Prepare tags array
    const tagsArray = tags
        ? tags.split(',').map(t => t.trim()).filter(t => t.length > 0)
        : [];

    try {
        const response = await fetch(`${apiUrl}/api/links`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                name,
                url,
                tags: tagsArray
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to add link');
        }

        showStatus('Link added successfully!', 'success');
        return true;
    } catch (error) {
        console.error('Error adding link:', error);
        showStatus(error.message || 'Failed to add link', 'error');
        return false;
    }
}

// Initialize popup
async function init() {
    const apiUrl = await loadConfig();
    
    // Get current tab
    try {
        const tab = await getCurrentTab();
        if (tab && tab.url) {
            // Pre-fill URL
            document.getElementById('link-url').value = tab.url;
            
            // Try to pre-fill name from tab title
            if (tab.title) {
                document.getElementById('link-name').value = tab.title;
            }
        }
    } catch (error) {
        console.error('Error getting current tab:', error);
    }

    // Form submission
    document.getElementById('link-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('link-name').value.trim();
        const url = document.getElementById('link-url').value.trim();
        const tags = document.getElementById('link-tags').value.trim();
        const apiUrl = document.getElementById('api-url').value.trim() || DEFAULT_API_URL;
        
        if (!name || !url) {
            showStatus('Name and URL are required', 'error');
            return;
        }

        // Save API URL
        await saveConfig();

        // Disable submit button
        const submitBtn = document.getElementById('submit-btn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Adding...';

        // Add link
        await addLink(name, url, tags, apiUrl);

        // Re-enable submit button
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add Link';
    });

    // Cancel button
    document.getElementById('cancel-btn').addEventListener('click', () => {
        window.close();
    });

    // Save API URL on change
    document.getElementById('api-url').addEventListener('blur', saveConfig);
}

// Run on load
init();

