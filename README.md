# Eagle File Server Plugin

A plugin for Eagle.cool that allows you to serve files from your Eagle library through a web server. This plugin runs as a background service and provides HTTP endpoints to access your files.
It provides a simple button to copy HTTP URLs for easy use in Obsidian, web applications, or anywhere you need them.
**Use Case**: Manage your images in Eagle, embed them in Obsidian
- **Copy HTTP URLs** with one click from the inspector
- **Embed images** directly in Obsidian using `![alt](http://localhost:8080/files/image-id)`
- **No file duplication** - images stay in Eagle, referenced via HTTP URLs

 
## Features
-  **Background Service**: Runs automatically when Eagle starts
-  **HTTP Server**: Serves files via HTTP endpoints
-  **File Access**: Access files by ID
-  **Easy to Use**: A sweet small button in the Inspector to copy the URL
-  **RESTful API**: Clean REST API for integration

## Installation

### Prerequisites

- Eagle.cool desktop application
- Node.js (for dependencies)

### Setup
1. **Load the plugin in Eagle**:
   - Open Eagle.cool
   - Go to Plugin settings
   - Load the plugin from the `eagleServer` directory
   - Enable the plugin

## API Endpoints

### Health Check
```
GET /health
```
Returns server status and information.

### Plugin Info
```
GET /info
```
Returns plugin information and configuration.

### List Files
```
GET /files
```
Returns a list of all files in your Eagle library.

### Get File by ID
```
GET /files/:fileId
```
Serves a specific file by its Eagle ID.


- `http://localhost:8080/health` - Health check
- `http://localhost:8080/info` - Plugin info
- `http://localhost:8080/files` - List files
- `http://localhost:8080/files/test-1` - Serve test file

## Development

### File Structure

```
eagleServer/
├── Eagle File Server.eagleplugin          # packed Eagle plugin 
├── manifest.json                          # Eagle plugin manifest
├── index.html                             # Plugin UI
├── js/
  │   └── plugin.js                        # Main plugin logic
  ├── package.json                         # Dependencies
  ├── test-server.js                       # Test script
  ├── logo.png                             # Plugin logo
  └── README.md                            # This file
```

## Troubleshooting

### Common Issues

1. **Port already in use**:
   - Change the port in plugin settings
   - Or stop the service using the port

2. **Files not found**:
   - Ensure Eagle is running
   - Check file permissions
   - Verify file IDs are correct

## License

MIT License - see LICENSE file for details.

