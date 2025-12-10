# Tabinator Browser Extension

A browser extension for quickly adding links to your Tabinator dashboard.

## Installation

### Chrome/Edge/Brave

1. Open your browser and navigate to:
   - `chrome://extensions/` (Chrome)
   - `edge://extensions/` (Edge)
   - `vivaldi://extensions/` (Vivaldi)
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `extension` folder from this repository
5. The extension icon should now appear in your toolbar

### Firefox

1. Open Firefox and navigate to `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select the `manifest.json` file from the `extension` folder

## Usage

1. Navigate to any webpage you want to save
2. Click the Tabinator extension icon in your toolbar
   - **Icon Badge**: A green checkmark (✓) appears on the icon if the current page is already saved in Tabinator
3. The popup will:
   - **For new links**: Pre-fill the current page URL and title, ready to add
   - **For existing links**: Automatically load the saved name and tags, ready to edit
4. Add or edit tags (comma-separated) if desired
5. Click "Add Link" or "Update Link" to save changes to your Tabinator dashboard
6. To delete a link, click the "Delete" button (only visible for existing links) and confirm

**Note:** The extension preserves URL hash fragments (`#...`) when matching links, so URLs with different hash fragments are treated as distinct links. This is important for Single Page Applications (SPAs) that use hash-based routing.

## Features

- **Smart Detection**: Automatically detects if the current page is already saved
- **Edit Mode**: If a link exists, the popup switches to edit mode, allowing you to update the name and tags
- **Delete Links**: Remove links directly from the extension popup with a confirmation dialog
- **Visual Indicator**: The extension icon shows a green checkmark (✓) badge when viewing a saved page
- **Auto-sync**: The icon badge updates automatically as you navigate between pages
- **URL Matching**: Preserves hash fragments for accurate matching of SPA routes

## Configuration

The extension needs to know your Tabinator server URL. By default, it uses `http://localhost:8080`.

To change it:
1. Open the extension popup
2. Enter your Tabinator server URL in the "Tabinator URL" field at the bottom
3. The setting is automatically saved

## Authentication

The extension uses your browser's session cookies to authenticate with Tabinator. If you're not logged in, the extension will prompt you to login and open Tabinator in a new tab.

## Icons

The extension includes placeholder icons. You can replace them in the `icons/` folder:
- `icon16.png` - 16x16 pixels
- `icon48.png` - 48x48 pixels  
- `icon128.png` - 128x128 pixels

