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

// Show debug info (append to log) - only in development
function showDebug(message) {
    // Only show debug in console, not in UI (unless there's an error)
    console.log('[DEBUG]', message);
    
    // Show debug panel only if there's an error or if explicitly enabled
    const debugEl = document.getElementById('debug-info');
    const debugText = document.getElementById('debug-text');
    if (debugEl && debugText && (message.includes('ERROR') || message.includes('error'))) {
        const timestamp = new Date().toLocaleTimeString();
        debugText.textContent += `[${timestamp}] ${message}\n`;
        debugEl.scrollTop = debugEl.scrollHeight;
        debugEl.style.display = 'block';
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
            // Only auto-close for add/update, not delete (let user see the success message)
            // window.close();
        }, 2000);
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
            method: 'GET',
            credentials: 'include',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            console.log('Auth check failed:', response.status);
            return false;
        }
        
        const data = await response.json();
        console.log('Auth check result:', data.authenticated, data);
        return data.authenticated || false;
    } catch (error) {
        console.error('Auth check error:', error);
        return false;
    }
}

// Normalize URL for comparison (remove trailing slash, but preserve hash for SPA routing)
function normalizeUrl(url) {
    if (!url) return '';
    try {
        const urlObj = new URL(url);
        // Remove trailing slash from pathname (except root)
        if (urlObj.pathname !== '/') {
            urlObj.pathname = urlObj.pathname.replace(/\/$/, '');
        }
        // DO NOT remove hash - it's important for SPA routing (e.g., #/case/123 vs #/case/list)
        // Only normalize empty query strings
        if (urlObj.search === '?') {
            urlObj.search = '';
        }
        // Return the normalized URL string
        return urlObj.toString();
    } catch (e) {
        // If URL parsing fails, just trim
        return url.trim();
    }
}

// Check if link exists by URL
async function checkLinkExists(url, apiUrl) {
    showDebug('Starting checkLinkExists...');
    console.log('[checkLinkExists] Starting with URL:', url);
    
    try {
        // Check authentication first
        showDebug('Checking authentication...');
        const authenticated = await checkAuth(apiUrl);
        console.log('[checkLinkExists] Authenticated:', authenticated);
        
        if (!authenticated) {
            showDebug('Not authenticated');
            console.log('Not authenticated, cannot check link existence');
            return null;
        }
        
        showDebug('Fetching links from API...');
        const response = await fetch(`${apiUrl}/api/data`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        console.log('[checkLinkExists] Response status:', response.status, response.ok);
        
        if (!response.ok) {
            if (response.status === 401) {
                showDebug('Not authenticated - please login in browser first');
                // Try to open Tabinator in a new tab to login
                setTimeout(() => {
                    chrome.tabs.create({ url: apiUrl });
                }, 2000);
            } else {
                showDebug(`API error: ${response.status}`);
            }
            console.error('Failed to fetch links:', response.status, response.statusText);
            return null;
        }
        
        showDebug('Parsing response...');
        const data = await response.json();
        console.log('[checkLinkExists] Got data, keys:', Object.keys(data));
        showDebug('Validating response structure...');
        console.log('=== API RESPONSE DEBUG ===');
        console.log('Full response keys:', Object.keys(data));
        console.log('data.links type:', typeof data.links);
        console.log('data.links is array?', Array.isArray(data.links));
        console.log('data.links length:', data.links ? data.links.length : 'null/undefined');
        
        if (!data.links || !Array.isArray(data.links)) {
            showDebug('ERROR: Invalid response format');
            console.error('Invalid response format:', data);
            return null;
        }
        
        showDebug(`Found ${data.links.length} links, searching...`);
        
        // SIMPLEST POSSIBLE CHECK - just search for the URL string
        const searchUrl = url.trim();
        showDebug(`Searching for: ${searchUrl.substring(0, 40)}...`);
        
        // Try multiple matching strategies
        let existingLink = null;
        
        // Strategy 1: Exact match
        console.log('Trying exact match...');
        existingLink = data.links.find(link => {
            if (!link.url) return false;
            const trimmed = link.url.trim();
            const matches = trimmed === searchUrl;
            if (matches) {
                console.log('EXACT MATCH FOUND!', link);
            }
            return matches;
        });
        if (existingLink) {
            showDebug(`✓ Found: "${existingLink.name}"`);
            console.log('RETURNING:', existingLink);
            return existingLink;
        }
        console.log('Exact match failed, trying case-insensitive...');
        
        // Strategy 2: Case-insensitive match
        const searchUrlLower = searchUrl.toLowerCase();
        existingLink = data.links.find(link => {
            if (!link.url) return false;
            return link.url.trim().toLowerCase() === searchUrlLower;
        });
        if (existingLink) {
            showDebug(`✓ Found (case-insensitive): "${existingLink.name}"`);
            console.log('FOUND via case-insensitive match:', existingLink);
            return existingLink;
        }
        
        // Strategy 3: Normalized match
        const normalizedSearchUrl = normalizeUrl(searchUrl);
        existingLink = data.links.find(link => {
            if (!link.url) return false;
            const normalizedLinkUrl = normalizeUrl(link.url.trim());
            return normalizedLinkUrl === normalizedSearchUrl;
        });
        if (existingLink) {
            showDebug(`✓ Found (normalized): "${existingLink.name}"`);
            console.log('FOUND via normalized match:', existingLink);
            return existingLink;
        }
        
        // Strategy 4: Contains match (for URLs with query params, etc.)
        existingLink = data.links.find(link => {
            if (!link.url) return false;
            const linkUrl = link.url.trim();
            return linkUrl.includes(searchUrl) || searchUrl.includes(linkUrl);
        });
        if (existingLink) {
            showDebug(`✓ Found (contains match): "${existingLink.name}"`);
            console.log('FOUND via contains match:', existingLink);
            return existingLink;
        }
        
        // Debug: Show what we're comparing
        console.log('=== COMPARISON FAILED ===');
        console.log('Search URL:', JSON.stringify(searchUrl));
        console.log('Search URL length:', searchUrl.length);
        if (data.links.length > 0) {
            console.log('First link URL:', JSON.stringify(data.links[0].url));
            console.log('First link URL length:', data.links[0].url ? data.links[0].url.length : 'null');
            console.log('Are they equal?', data.links[0].url === searchUrl);
            
            // Try to find a similar URL
            const similar = data.links.find(link => {
                if (!link.url) return false;
                const linkUrl = link.url.trim().toLowerCase();
                const searchLower = searchUrlLower;
                // Check if they share a significant portion
                const minLength = Math.min(linkUrl.length, searchLower.length);
                if (minLength < 20) return false;
                const commonStart = linkUrl.substring(0, 30) === searchLower.substring(0, 30);
                return commonStart;
            });
            if (similar) {
                console.log('Found similar URL:', similar.url);
                showDebug(`Similar URL found: ${similar.url.substring(0, 40)}...`);
            }
        }
        
        // If no exact match, try normalized comparison
        if (!existingLink) {
            console.log('No exact match, trying normalized comparison...');
            existingLink = data.links.find(link => {
                const normalizedLinkUrl = normalizeUrl(link.url);
                const matches = normalizedLinkUrl === normalizedSearchUrl;
                if (matches) {
                    console.log('✓ NORMALIZED MATCH FOUND!');
                    console.log('  Search URL:', normalizedSearchUrl);
                    console.log('  Link URL:', link.url);
                    console.log('  Normalized Link URL:', normalizedLinkUrl);
                }
                return matches;
            });
        }
        
        // If still no match, try case-insensitive comparison
        if (!existingLink) {
            console.log('No normalized match, trying case-insensitive comparison...');
            const searchUrlLower = normalizedSearchUrl.toLowerCase();
            existingLink = data.links.find(link => {
                const normalizedLinkUrl = normalizeUrl(link.url).toLowerCase();
                const matches = normalizedLinkUrl === searchUrlLower;
                if (matches) {
                    console.log('✓ CASE-INSENSITIVE MATCH FOUND!');
                    console.log('  Search URL (lower):', searchUrlLower);
                    console.log('  Link URL:', link.url);
                    console.log('  Normalized Link URL (lower):', normalizedLinkUrl);
                }
                return matches;
            });
        }
        
        if (existingLink) {
            console.log('✓ FINAL RESULT: Found existing link:', existingLink.name, existingLink.url);
            showDebug(`✓ Found: "${existingLink.name}"`);
            return existingLink;
        } else {
            console.log('✗ FINAL RESULT: Link not found');
            console.log('Searching for:', url);
            console.log('Normalized:', normalizedSearchUrl);
            // Check if any URLs are similar (for debugging)
            const similarUrls = data.links.filter(link => {
                const linkNorm = normalizeUrl(link.url).toLowerCase();
                const searchNorm = normalizedSearchUrl.toLowerCase();
                return linkNorm.includes(searchNorm.substring(0, 30)) || searchNorm.includes(linkNorm.substring(0, 30));
            });
            if (similarUrls.length > 0) {
                console.log('Similar URLs found (might be a match issue):');
                similarUrls.forEach(link => {
                    console.log(`  "${link.name}": ${link.url}`);
                });
                showDebug(`Found ${similarUrls.length} similar URLs but no exact match`);
            } else {
                showDebug(`No match found in ${data.links.length} links`);
            }
        }
        console.log('=== END URL CHECK ===');
        
        return null;
    } catch (error) {
        console.error('Error checking link:', error);
        showDebug(`ERROR: ${error.message}`);
        return null;
    }
}

// Add or update link in Tabinator
async function saveLink(name, url, tags, apiUrl, isUpdate = false) {
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
        let response;
        if (isUpdate) {
            // Update existing link
            response = await fetch(`${apiUrl}/api/links`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    originalUrl: url,
                    updatedLink: {
                        name,
                        url,
                        tags: tagsArray
                    }
                })
            });
        } else {
            // Create new link
            response = await fetch(`${apiUrl}/api/links`, {
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
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `Failed to ${isUpdate ? 'update' : 'add'} link`);
        }

        // Notify service worker to update icon
        chrome.runtime.sendMessage({ type: 'linkChanged' });
        
        showStatus(`Link ${isUpdate ? 'updated' : 'added'} successfully!`, 'success');
        return true;
    } catch (error) {
        console.error(`Error ${isUpdate ? 'updating' : 'adding'} link:`, error);
        showStatus(error.message || `Failed to ${isUpdate ? 'update' : 'add'} link`, 'error');
        return false;
    }
}

// Initialize popup
async function init() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        await new Promise(resolve => {
            document.addEventListener('DOMContentLoaded', resolve);
        });
    }
    
    // Verify essential elements exist
    const requiredElements = ['link-form', 'link-name', 'link-url', 'link-tags', 'submit-btn', 'cancel-btn', 'api-url', 'delete-btn'];
    const missingElements = [];
    for (const id of requiredElements) {
        if (!document.getElementById(id)) {
            console.error(`Required element not found: ${id}`);
            missingElements.push(id);
        }
    }
    if (missingElements.length > 0) {
        console.error('Missing elements:', missingElements);
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.textContent = `Extension error: Missing elements: ${missingElements.join(', ')}. Please reload the extension.`;
            statusEl.className = 'status error';
        }
        return;
    }
    
    const apiUrl = await loadConfig();
    let isUpdateMode = false;
    let originalUrl = null;
    
    // Get current tab
    try {
        const tab = await getCurrentTab();
        if (tab && tab.url) {
            // Skip internal pages
            if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
                document.getElementById('link-url').value = '';
                document.getElementById('link-url').placeholder = 'Navigate to a webpage first';
                document.getElementById('link-url').disabled = true;
                document.getElementById('link-name').disabled = true;
                document.getElementById('link-tags').disabled = true;
                document.getElementById('submit-btn').disabled = true;
                showStatus('Please navigate to a webpage to add it to Tabinator', 'info');
                return;
            }
            
            // Pre-fill URL
            originalUrl = tab.url;
            document.getElementById('link-url').value = tab.url;
            
            showDebug(`Checking if URL exists: ${tab.url.substring(0, 50)}...`);
            
            // Show loading state
            const submitBtn = document.getElementById('submit-btn');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Checking...';
            
            // Check if link already exists
            try {
                showDebug(`Checking URL: ${tab.url.substring(0, 60)}...`);
                console.log('[INIT] About to call checkLinkExists with:', tab.url);
                
                // First verify we're authenticated
                const authCheck = await checkAuth(apiUrl);
                if (!authCheck) {
                    showDebug('⚠️ Not authenticated. Please login to Tabinator first.');
                    showStatus('Please login to Tabinator in your browser first, then try again', 'error');
                    // Open Tabinator in new tab after a delay
                    setTimeout(() => {
                        chrome.tabs.create({ url: apiUrl });
                    }, 3000);
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Add Link';
                    return;
                }
                
                showDebug('✓ Authenticated, checking for existing link...');
                const existingLink = await checkLinkExists(tab.url, apiUrl);
                
                console.log('[INIT] checkLinkExists returned:', existingLink);
                showDebug(existingLink ? `Result: Found "${existingLink.name}"` : 'Result: Not found');
                
                if (existingLink) {
                    showDebug(`✓ Found existing link: "${existingLink.name}"`);
                    // Switch to update mode
                    isUpdateMode = true;
                    document.getElementById('form-title').textContent = 'Edit Tabinator Link';
                    submitBtn.textContent = 'Update Link';
                    document.getElementById('url-hint').style.display = 'block';
                    document.getElementById('delete-btn').style.display = 'block';
                    
                    // Pre-fill existing data
                    document.getElementById('link-name').value = existingLink.name || tab.title || '';
                    if (existingLink.tags && existingLink.tags.length > 0) {
                        document.getElementById('link-tags').value = existingLink.tags.join(', ');
                    }
                } else {
                    // Hide delete button in add mode
                    document.getElementById('delete-btn').style.display = 'none';
                    showDebug('✗ Link not found - ready to add');
                    // Add mode - try to pre-fill name from tab title
                    if (tab.title) {
                        document.getElementById('link-name').value = tab.title;
                    }
                }
            } catch (error) {
                console.error('[INIT] Error during link check:', error);
                showDebug(`ERROR: ${error.message || error}`);
                // Default to add mode on error
                if (tab.title) {
                    document.getElementById('link-name').value = tab.title;
                }
            } finally {
                // Re-enable submit button
                submitBtn.disabled = false;
                if (!isUpdateMode) {
                    submitBtn.textContent = 'Add Link';
                }
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
        submitBtn.textContent = isUpdateMode ? 'Updating...' : 'Adding...';

        // Save link (add or update)
        await saveLink(name, url, tags, apiUrl, isUpdateMode);

        // Re-enable submit button
        submitBtn.disabled = false;
        submitBtn.textContent = isUpdateMode ? 'Update Link' : 'Add Link';
    });

    // Cancel button
    document.getElementById('cancel-btn').addEventListener('click', () => {
        window.close();
    });

    // Delete button
    document.getElementById('delete-btn').addEventListener('click', async () => {
        const url = document.getElementById('link-url').value.trim();
        const name = document.getElementById('link-name').value.trim() || url;
        const apiUrl = document.getElementById('api-url').value.trim() || DEFAULT_API_URL;
        
        if (!url) {
            showStatus('No URL to delete', 'error');
            return;
        }
        
        // Confirm deletion
        if (!confirm(`Are you sure you want to delete this link?\n\n"${name}"\n${url}`)) {
            return;
        }
        
        const deleteBtn = document.getElementById('delete-btn');
        deleteBtn.disabled = true;
        deleteBtn.textContent = 'Deleting...';
        
        try {
            // Check authentication
            const authenticated = await checkAuth(apiUrl);
            if (!authenticated) {
                showStatus('Please login to Tabinator first in your browser', 'error');
                setTimeout(() => {
                    chrome.tabs.create({ url: apiUrl });
                }, 2000);
                return;
            }
            
            const response = await fetch(`${apiUrl}/api/links`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({ url })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to delete link');
            }
            
            // Notify service worker to update icon
            chrome.runtime.sendMessage({ type: 'linkChanged' });
            
            showStatus('Link deleted successfully!', 'success');
            
            // Reset form and switch back to add mode
            setTimeout(async () => {
                document.getElementById('link-form').reset();
                document.getElementById('delete-btn').style.display = 'none';
                document.getElementById('url-hint').style.display = 'none';
                document.getElementById('form-title').textContent = 'Add to Tabinator';
                document.getElementById('submit-btn').textContent = 'Add Link';
                
                // Clear the URL field and re-init to check current tab
                try {
                    const tab = await getCurrentTab();
                    if (tab && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://') && !tab.url.startsWith('about:')) {
                        document.getElementById('link-url').value = tab.url;
                        if (tab.title) {
                            document.getElementById('link-name').value = tab.title;
                        }
                    }
                } catch (error) {
                    console.error('Error getting tab after delete:', error);
                }
            }, 2000);
        } catch (error) {
            console.error('Error deleting link:', error);
            showStatus(error.message || 'Failed to delete link', 'error');
        } finally {
            deleteBtn.disabled = false;
            deleteBtn.textContent = 'Delete';
        }
        });

    // Save API URL on change
    document.getElementById('api-url').addEventListener('blur', saveConfig);
}

// Run on load with error handling
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        init().catch(error => {
            console.error('Failed to initialize popup:', error);
            const statusEl = document.getElementById('status');
            if (statusEl) {
                statusEl.textContent = 'Failed to initialize extension. Please check console and reload.';
                statusEl.className = 'status error';
            }
        });
    });
} else {
    // DOM already loaded
    init().catch(error => {
        console.error('Failed to initialize popup:', error);
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.textContent = 'Failed to initialize extension. Please check console and reload.';
            statusEl.className = 'status error';
        }
    });
}

