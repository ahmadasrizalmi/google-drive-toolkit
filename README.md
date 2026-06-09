# Google Drive Toolkit Chrome Extension

Google Drive Toolkit Chrome Extension — extract download links, copy to your drive, bulk download from shared folders.

## Features

- Login with Google (OAuth, same client_id as agy)
- List all files in shared Google Drive folder
- Direct download links for each file
- Copy single file to My Drive
- Copy multiple files to My Drive (creates new folder)
- Download single file
- Download selected files as ZIP (client-side, no server)
- Download ALL files as ZIP
- Generate direct download links
- Copy all links to clipboard
- Export links as TSV
- File type detection (image, video, PDF, folder)
- File size display
- Select All / individual selection
- Progress indicator
- Apple-style UI (light theme, no AI slop)

## Install

1. Clone this repo
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the `google-drive-toolkit` folder

## Usage

1. Click extension icon → Side panel opens
2. Click "Login with Google" → Select your Google account
3. Navigate to a shared Google Drive folder
4. Click extension icon → Files will load automatically
5. Select files you want
6. Choose action:
   - **Copy to My Drive**: Creates a new folder and copies all selected files
   - **Download as ZIP**: Downloads selected files as a single ZIP (client-side)
   - **Generate Links**: Creates direct download links for each file

## How It Works

### Copy to My Drive
- Creates a new folder named "Copied_YYYY-MM-DD" in your Google Drive
- Copies all selected files to that folder
- Uses Google Drive API `files.copy` endpoint

### Download as ZIP
- Downloads all selected files from Google Drive
- Compresses them into a ZIP file on the client-side (no server involved)
- Downloads the ZIP to your computer

### Generate Links
- Generates direct download links (`https://drive.google.com/uc?export=download&id=FILE_ID`)
- Copy individual links or all links at once
- Export as TSV file

## Permissions

- `identity`: Google OAuth login
- `storage`: Save user preferences
- `downloads`: Download files
- `drive`: Access Google Drive API

## Tech

- Chrome Extension Manifest V3
- Google Drive API v3
- OAuth via `chrome.identity`
- Client-side ZIP generation (no server)
- Content script for folder detection
- No external dependencies
