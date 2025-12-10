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
3. The popup will pre-fill the current page URL and title
4. Add tags (comma-separated) if desired
5. Click "Add Link" to save it to your Tabinator dashboard

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

