# SongSelect Lyrics Downloader

A Chrome extension that bulk-downloads the official lyrics `.txt` files for all songs in your [SongSelect](https://songselect.ccli.com/) "Unique Songs Used" list.

## Features

- Adds a "Download All Lyrics" button to the Unique Songs Used page
- Automatically paginates through all songs in your list
- Triggers the official Export > Download for each song, producing the same `.txt` files you'd get manually
- Deduplication: scans a folder you choose and skips songs that have already been downloaded
- Progress overlay with per-song status logging
- Automatic retry on failure with rate-limiting delays between downloads

## Installation

1. Clone or download this repository
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (toggle in the top-right)
4. Click **Load unpacked** and select the `SongSelectPlugin` folder

## Usage

1. Log in to [SongSelect](https://songselect.ccli.com/)
2. Navigate to **Account > Activity > Unique Songs Used**
3. Click the **Download All Lyrics** button (bottom-right corner)
4. Select the folder where your existing lyrics files are saved (for deduplication)
5. The extension will download each song's lyrics file to your browser's default Downloads folder, skipping any that already exist in the selected folder

## Requirements

- A valid [CCLI](https://www.ccli.com/) license with SongSelect access
- Google Chrome (Manifest V3)

## File Structure

- `manifest.json` — Extension manifest
- `content.js` — Main content script: UI, song collection, iframe coordination
- `content.css` — Styles for the download button and progress overlay
- `lyrics-content.js` — Content script injected into lyrics page iframes to click Export > Download
