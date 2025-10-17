console.log('Eagle File Server Plugin - Starting...');

const http = require('http');
const fs = require('fs');
const path = require('path');

class EagleFileServer {
    constructor() {
        this.isRunning = false;
        this.port = 8080;
        this.basePath = '/';
        this.enableCORS = true;
        this.server = null;
        this.eagleDataPath = null; // Will be set when plugin initializes
    }


    async init() {
        try {
            // Get Eagle library path using the Eagle API
            this.eagleDataPath = eagle.library.path;            
            console.log('Starting Eagle File Server...');
            this.startHTTPServer();
            console.log('Eagle File Server ready');
        } catch (error) {
            console.error('Failed to initialize Eagle File Server:', error);
        }
    }

    async loadFileById(fileId) {
        try {
            const imagesPath = path.join(this.eagleDataPath, 'images');
            const itemDir = `${fileId}.info`;
            const itemPath = path.join(imagesPath, itemDir);
            
            if (!fs.existsSync(itemPath)) {
                return null; // File not found
            }
            
            const metadataPath = path.join(itemPath, 'metadata.json');
            if (!fs.existsSync(metadataPath)) {
                return null;
            }
            
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            
            // Find the main file in this directory
            const filesInDir = fs.readdirSync(itemPath);
            const mainFile = filesInDir.find(file => 
                !file.endsWith('_thumbnail.png') && 
                !file.endsWith('.json') &&
                fs.statSync(path.join(itemPath, file)).isFile()
            );
            
            if (!mainFile) {
                return null;
            }
            
            const mainFilePath = path.join(itemPath, mainFile);
            const fileStat = fs.statSync(mainFilePath);
            const ext = path.extname(mainFile).toLowerCase();
            
            return {
                id: fileId,
                name: mainFile,
                path: mainFilePath,
                type: this.getFileType(ext),
                size: fileStat.size,
                created: new Date(metadata.btime || fileStat.birthtime).toISOString(),
                modified: new Date(metadata.mtime || fileStat.mtime).toISOString(),
                tags: metadata.tags || [],
                metadata: metadata
            };
            
        } catch (error) {
            console.error(`Error loading file ${fileId}:`, error);
            return null;
        }
    }

    // Get file type from extension
    getFileType(ext) {
        const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tiff'];
        const videoExts = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv'];
        const audioExts = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a'];
        const docExts = ['.pdf', '.doc', '.docx', '.txt', '.rtf','.js'];
        
        if (imageExts.includes(ext)) return 'image';
        if (videoExts.includes(ext)) return 'video';
        if (audioExts.includes(ext)) return 'audio';
        if (docExts.includes(ext)) return 'document';
        return 'other';
    }

    // Get MIME type from file extension
    getMimeType(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.bmp': 'image/bmp',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml',
            '.tiff': 'image/tiff',
            '.mp4': 'video/mp4',
            '.avi': 'video/x-msvideo',
            '.mov': 'video/quicktime',
            '.wmv': 'video/x-ms-wmv',
            '.flv': 'video/x-flv',
            '.webm': 'video/webm',
            '.mkv': 'video/x-matroska',
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.flac': 'audio/flac',
            '.aac': 'audio/aac',
            '.ogg': 'audio/ogg',
            '.m4a': 'audio/mp4',
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.txt': 'text/plain',
            '.rtf': 'application/rtf'
        };
        return mimeTypes[ext] || 'application/octet-stream';
    }


    startHTTPServer() {
        try {
            this.server = http.createServer((req, res) => {
                if (this.enableCORS) {
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
                    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
                }
                
                if (req.method === 'OPTIONS') {
                    res.writeHead(200);
                    res.end();
                    return;
                }

                const url = new URL(req.url, `http://localhost:${this.port}`);
                const pathname = url.pathname;

                console.log(`${new Date().toISOString()} - ${req.method} ${pathname}`);

                if (pathname.startsWith('/files/')) {
                    const fileId = pathname.split('/')[2];
                    this.handleFileById(req, res, fileId);
                } else {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        status: 'ok', 
                        message: 'Eagle File Server - Lazy Loading Mode',
                        port: this.port,
                        eagleDataPath: this.eagleDataPath
                    }));
                }
            });

            this.server.listen(this.port, () => {
                this.isRunning = true;
                console.log(`🚀 Eagle File Server running on http://localhost:${this.port}`);
                console.log(`📁 Eagle data path: ${this.eagleDataPath}`);
                console.log(`🔗 Health check: http://localhost:${this.port}/`);
                console.log(`📁 File serving: http://localhost:${this.port}/files/{fileId}`);
            });

            this.server.on('error', (error) => {
                if (error.code === 'EADDRINUSE') {
                    console.error(`Port ${this.port} is already in use. Please choose a different port.`);
                } else {
                    console.error('Server error:', error);
                }
                this.isRunning = false;
            });

        } catch (error) {
            console.error('Failed to start HTTP server:', error);
            this.isRunning = false;
        }
    }


    async handleFileById(req, res, fileId) {
        const file = await this.loadFileById(fileId);
        
        if (!file) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'File not found' }));
            return;
        }

        const filePath = file.path;
        if (!fs.existsSync(filePath)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'File not found on disk' }));
            return;
        }

        // Set appropriate headers
        const mimeType = this.getMimeType(filePath);
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
        res.setHeader('Cache-Control', 'public, max-age=3600');

        // Stream the file
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

        fileStream.on('error', (error) => {
            console.error('Error streaming file:', error);
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Error reading file' }));
            }
        });
    }


    stopServer() {
        if (this.server) {
            this.server.close();
            this.isRunning = false;
            console.log('Eagle File Server stopped');
        }
    }

}

const fileServer = new EagleFileServer();

eagle.onPluginCreate((plugin) => {});

eagle.onPluginRun(async () => {
    await fileServer.init();
});

eagle.onPluginShow(() => {});

eagle.onPluginHide(() => {});

eagle.onPluginDestroy(async () => {
    fileServer.stopServer();
});

window.eagleFileServer = fileServer;