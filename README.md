# Google Drive Toolkit Chrome Extension

Google Drive Toolkit Chrome Extension — extract download links, copy to your drive, bulk download from shared folders.

## Features

- Login with Google (OAuth)
- List all files in shared Google Drive folder
- Direct download links for each file
- Copy single file to My Drive
- Copy multiple files to My Drive (creates new folder)
- Download single file
- Download all files
- Generate direct download links
- Copy all links to clipboard
- Export links as TSV
- File type detection (image, video, PDF, folder)
- File size display
- Select All / individual selection
- Apple-style UI (light theme, no AI slop)

## Install

1. Clone this repo
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the `google-drive-toolkit` folder

## Usage

1. Click extension icon → Popup opens
2. Click "Login with Google" → Select your Google account
3. Navigate to a shared Google Drive folder
4. Click extension icon → Files will load automatically
5. Select files you want
6. Choose action:
   - **Copy to My Drive**: Creates a new folder and copies all selected files
   - **Download All**: Downloads all files
   - **Generate Links**: Creates direct download links for each file

## Tech

- Chrome Extension Manifest V3
- Google Drive API v3
- OAuth via `chrome.identity`
- Apple-style popup UI
- No external dependencies
