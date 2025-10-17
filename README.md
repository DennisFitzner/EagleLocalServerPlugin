# Eagle File Server Plugin

A plugin for Eagle.cool that allows you to serve files from your Eagle library through a web server. This plugin runs as a background service and provides HTTP endpoints to access your files.

## Features

- 🚀 **Background Service**: Runs automatically when Eagle starts
- 🌐 **HTTP Server**: Serves files via HTTP endpoints
- 🔒 **Security**: Built-in security checks and CORS support
- ⚙️ **Configurable**: Customizable port and settings
- 📁 **File Access**: Access files by ID or search
- 📊 **Metadata**: Access file metadata and tags
- 🎯 **RESTful API**: Clean REST API for integration

## Installation

### Prerequisites

- Eagle.cool desktop application
- Node.js (for dependencies)

### Setup

1. **Install dependencies**:
   ```bash
   cd eagleServer
   npm install
   ```

2. **Load the plugin in Eagle**:
   - Open Eagle.cool
   - Go to Plugin settings
   - Load the plugin from the `eagleServer` directory
   - Enable the plugin

## Configuration

The plugin can be configured through Eagle's plugin settings:

- **Port**: Server port (default: 8080)
- **Base Path**: Base path for the server (e.g., `/files`)
- **Enable CORS**: Enable Cross-Origin Resource Sharing

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

### Search Files
```
GET /files/search?q=query&type=image&limit=10
```
Search files in your Eagle library.

## Usage Examples

### Basic File Access

```javascript
// Get all files
fetch('http://localhost:8080/files')
  .then(response => response.json())
  .then(data => console.log(data.files));

// Get a specific file
fetch('http://localhost:8080/files/your-file-id')
  .then(response => response.blob())
  .then(blob => {
    const url = URL.createObjectURL(blob);
    const img = document.createElement('img');
    img.src = url;
    document.body.appendChild(img);
  });
```

### Search Files

```javascript
// Search for images
fetch('http://localhost:8080/files/search?q=landscape&type=image&limit=5')
  .then(response => response.json())
  .then(data => console.log(data.results));
```

### Direct File Serving

```html
<!-- Serve an image directly -->
<img src="http://localhost:8080/files/your-image-id" alt="My Image">

<!-- Serve a video -->
<video controls>
  <source src="http://localhost:8080/files/your-video-id" type="video/mp4">
</video>
```

## Testing

### Test the Plugin

You can just drag the "Eagle File Server.eagleplugin" into your running eagle instance to install the plugin. If you want to change anything you have to reload it via the deleloper options - Import Local Project.

### Test Endpoints

Once the server is running, you can test the following endpoints:

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

