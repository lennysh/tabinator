// Tabinator Browser Extension Service Worker
// Monitors tabs and updates icon badge to show if current URL is saved

const DEFAULT_API_URL = 'http://localhost:8080';

// Cache for link URLs to avoid repeated API calls
let linkUrlCache = new Set();
let cacheTimestamp = 0;
const CACHE_DURATION = 60000; // 1 minute

// Load saved API URL
async function getApiUrl() {
    const result = await chrome.storage.sync.get(['apiUrl']);
    return result.apiUrl || DEFAULT_API_URL;
}

// Check if user is authenticated
async function checkAuth(apiUrl) {
    try {
        const response = await fetch(`${apiUrl}/api/auth/me`, {
            credentials: 'include'
        });
        if (!response.ok) {
            return false;
        }
        const data = await response.json();
        return data.authenticated || false;
    } catch (error) {
        // Silently fail - user might not be logged in
        return false;
    }
}

// Fetch all links from Tabinator
async function fetchLinks(apiUrl) {
    try {
        const response = await fetch(`${apiUrl}/api/data`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            // Don't log errors for 401/403 - user just needs to log in
            if (response.status !== 401 && response.status !== 403) {
                console.warn('Failed to fetch links:', response.status, response.statusText);
            }
            return null;
        }
        
        const data = await response.json();
        return data.links || [];
    } catch (error) {
        // Only log network errors, not auth errors
        if (error.name !== 'TypeError') {
            console.warn('Error fetching links:', error.message);
        }
        return null;
    }
}

// Update link cache
async function updateLinkCache() {
    const apiUrl = await getApiUrl();
    const authenticated = await checkAuth(apiUrl);
    
    if (!authenticated) {
        linkUrlCache.clear();
        cacheTimestamp = 0;
        return;
    }
    
    const links = await fetchLinks(apiUrl);
    if (links) {
        // Store both original and normalized URLs for better matching
        linkUrlCache = new Set();
        links.forEach(link => {
            linkUrlCache.add(link.url);
            // Also add normalized version
            const normalized = normalizeUrl(link.url);
            if (normalized !== link.url) {
                linkUrlCache.add(normalized);
            }
        });
        cacheTimestamp = Date.now();
        console.log('Link cache updated:', linkUrlCache.size, 'URLs cached');
    }
}

// Normalize URL for comparison (preserve hash for SPA routing)
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
        return urlObj.toString();
    } catch (e) {
        return url.trim();
    }
}

// Check if URL is saved
async function isUrlSaved(url) {
    // Refresh cache if it's stale
    if (Date.now() - cacheTimestamp > CACHE_DURATION) {
        await updateLinkCache();
    }
    
    // Check both original and normalized URL
    return linkUrlCache.has(url) || linkUrlCache.has(normalizeUrl(url));
}

// Update icon badge for a tab
async function updateIconForTab(tabId, url) {
    try {
        if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) {
            // Clear badge for internal pages
            chrome.action.setBadgeText({ text: '', tabId });
            return;
        }
        
        const saved = await isUrlSaved(url);
        
        if (saved) {
            chrome.action.setBadgeText({ text: '✓', tabId });
            chrome.action.setBadgeBackgroundColor({ color: '#10b981', tabId }); // Green
        } else {
            chrome.action.setBadgeText({ text: '', tabId });
        }
    } catch (error) {
        // Silently handle errors - don't spam console
        console.warn('Error updating icon for tab:', error.message);
    }
}

// Listen for tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab.url) {
            await updateIconForTab(activeInfo.tabId, tab.url);
        }
    } catch (error) {
        console.error('Error updating icon for activated tab:', error);
    }
});

// Listen for tab updates (URL changes)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.url) {
        await updateIconForTab(tabId, changeInfo.url);
    }
});

// Listen for messages from popup (when link is added/updated)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'linkChanged') {
        // Invalidate cache and update current tab
        cacheTimestamp = 0;
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (tabs[0]) {
                await updateIconForTab(tabs[0].id, tabs[0].url);
            }
        });
    }
    return true;
});

// Initialize: update cache and current tab on startup
chrome.runtime.onStartup.addListener(async () => {
    await updateLinkCache();
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (tabs[0]) {
            await updateIconForTab(tabs[0].id, tabs[0].url);
        }
    });
});

// Also initialize when extension is installed/enabled
chrome.runtime.onInstalled.addListener(async () => {
    await updateLinkCache();
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (tabs[0]) {
            await updateIconForTab(tabs[0].id, tabs[0].url);
        }
    });
});

// Update cache periodically
setInterval(updateLinkCache, CACHE_DURATION);

