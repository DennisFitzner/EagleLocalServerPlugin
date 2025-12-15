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
                folders: metadata.folders || [],
                ext: ext,
                width: metadata.width || null,
                height: metadata.height || null,
                metadata: metadata
            };
            
        } catch (error) {
            console.error(`Error loading file ${fileId}:`, error);
            return null;
        }
    }

    // Get all file IDs from the images directory
    async getAllFileIds() {
        try {
            const imagesPath = path.join(this.eagleDataPath, 'images');
            if (!fs.existsSync(imagesPath)) {
                return [];
            }
            
            const dirs = fs.readdirSync(imagesPath);
            const fileIds = dirs
                .filter(dir => dir.endsWith('.info'))
                .map(dir => dir.replace('.info', ''));
            
            return fileIds;
        } catch (error) {
            console.error('Error getting all file IDs:', error);
            return [];
        }
    }

    // Filter files based on criteria
    matchesFilter(file, filters) {
        if (!file) return false;

        // Keyword filter - search in name, tags, and metadata
        if (filters.keyword) {
            const keyword = filters.keyword.toLowerCase();
            const nameMatch = file.name.toLowerCase().includes(keyword);
            const tagsMatch = (file.tags || []).some(tag => 
                tag.toLowerCase().includes(keyword)
            );
            const metadataMatch = JSON.stringify(file.metadata || {}).toLowerCase().includes(keyword);
            
            if (!nameMatch && !tagsMatch && !metadataMatch) {
                return false;
            }
        }

        // Extension filter
        if (filters.ext) {
            let extFilter = filters.ext.toLowerCase();
            // Add dot if not present
            if (!extFilter.startsWith('.')) {
                extFilter = '.' + extFilter;
            }
            const fileExt = file.ext || path.extname(file.name).toLowerCase();
            if (fileExt !== extFilter) {
                return false;
            }
        }

        // Tags filter - file must have all specified tags
        if (filters.tags) {
            const requiredTags = Array.isArray(filters.tags) 
                ? filters.tags 
                : filters.tags.split(',').map(t => t.trim());
            const fileTags = (file.tags || []).map(t => t.toLowerCase());
            const hasAllTags = requiredTags.every(tag => 
                fileTags.includes(tag.toLowerCase())
            );
            if (!hasAllTags) {
                return false;
            }
        }

        // Folders filter - file must be in at least one of the specified folders
        if (filters.folders) {
            const requiredFolders = Array.isArray(filters.folders)
                ? filters.folders
                : filters.folders.split(',').map(f => f.trim());
            const fileFolders = (file.folders || []).map(f => f.toLowerCase());
            const hasAnyFolder = requiredFolders.some(folder =>
                fileFolders.includes(folder.toLowerCase())
            );
            if (!hasAnyFolder) {
                return false;
            }
        }

        return true;
    }

    // Sort files based on orderBy parameter
    sortFiles(files, orderBy) {
        if (!orderBy || orderBy.toLowerCase() === 'random') {
            // Shuffle array randomly
            for (let i = files.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [files[i], files[j]] = [files[j], files[i]];
            }
            return files;
        }

        const order = orderBy.toLowerCase();
        
        switch (order) {
            case 'name':
            case 'name_asc':
                return files.sort((a, b) => a.name.localeCompare(b.name));
            case 'name_desc':
                return files.sort((a, b) => b.name.localeCompare(a.name));
            case 'created':
            case 'created_asc':
                return files.sort((a, b) => new Date(a.created) - new Date(b.created));
            case 'created_desc':
                return files.sort((a, b) => new Date(b.created) - new Date(a.created));
            case 'modified':
            case 'modified_asc':
                return files.sort((a, b) => new Date(a.modified) - new Date(b.modified));
            case 'modified_desc':
                return files.sort((a, b) => new Date(b.modified) - new Date(a.modified));
            case 'size':
            case 'size_asc':
                return files.sort((a, b) => a.size - b.size);
            case 'size_desc':
                return files.sort((a, b) => b.size - a.size);
            default:
                // Default to created_desc
                return files.sort((a, b) => new Date(b.created) - new Date(a.created));
        }
    }

    // Get list of files with filtering and pagination
    async getFileList(filters = {}) {
        try {
            const fileIds = await this.getAllFileIds();
            const files = [];
            
            // Load all files (this could be optimized with caching)
            for (const fileId of fileIds) {
                const file = await this.loadFileById(fileId);
                if (file && this.matchesFilter(file, filters)) {
                    // Return only file information, not the full file object
                    files.push({
                        id: file.id,
                        name: file.name,
                        type: file.type,
                        size: file.size,
                        created: file.created,
                        modified: file.modified,
                        tags: file.tags,
                        folders: file.folders,
                        ext: file.ext,
                        width: file.width,
                        height: file.height
                    });
                }
            }

            // Sort files
            const sortedFiles = this.sortFiles([...files], filters.orderBy);

            // Apply pagination
            const limit = parseInt(filters.limit) || 100;
            const offset = parseInt(filters.offset) || 0;
            const paginatedFiles = sortedFiles.slice(offset, offset + limit);

            return {
                files: paginatedFiles,
                total: sortedFiles.length,
                limit: limit,
                offset: offset
            };
        } catch (error) {
            console.error('Error getting file list:', error);
            return {
                files: [],
                total: 0,
                limit: 0,
                offset: 0
            };
        }
    }

    // Load only metadata for filtering (lightweight, doesn't load full file)
    async loadFileMetadata(fileId) {
        try {
            const imagesPath = path.join(this.eagleDataPath, 'images');
            const itemDir = `${fileId}.info`;
            const itemPath = path.join(imagesPath, itemDir);
            
            if (!fs.existsSync(itemPath)) {
                return null;
            }
            
            const metadataPath = path.join(itemPath, 'metadata.json');
            if (!fs.existsSync(metadataPath)) {
                return null;
            }
            
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            
            // Get filename from metadata or find it quickly
            let fileName = metadata.name || metadata.ext || '';
            let ext = '';
            
            // If we don't have the name in metadata, do a quick directory scan
            if (!fileName) {
                const filesInDir = fs.readdirSync(itemPath);
                const mainFile = filesInDir.find(file => 
                    !file.endsWith('_thumbnail.png') && 
                    !file.endsWith('.json') &&
                    fs.statSync(path.join(itemPath, file)).isFile()
                );
                if (mainFile) {
                    fileName = mainFile;
                    ext = path.extname(mainFile).toLowerCase();
                }
            } else {
                ext = path.extname(fileName).toLowerCase();
            }
            
            return {
                id: fileId,
                name: fileName,
                ext: ext,
                tags: metadata.tags || [],
                folders: metadata.folders || [],
                metadata: metadata
            };
        } catch (error) {
            // Silently fail for individual files during filtering
            return null;
        }
    }

    // Get a random file ID (optimized - only loads metadata for filtering)
    async getRandomFileId(filters = {}) {
        try {
            const fileIds = await this.getAllFileIds();
            const matchingIds = [];
            
            // Only load lightweight metadata for filtering
            for (const fileId of fileIds) {
                const fileMeta = await this.loadFileMetadata(fileId);
                if (fileMeta && this.matchesFilter(fileMeta, filters)) {
                    matchingIds.push(fileId);
                }
            }

            if (matchingIds.length === 0) {
                return null;
            }

            // Randomly select one ID (we only loaded metadata, not full files)
            const randomIndex = Math.floor(Math.random() * matchingIds.length);
            return matchingIds[randomIndex];
        } catch (error) {
            console.error('Error getting random file ID:', error);
            return null;
        }
    }

    // Get a random file (optimized - only loads metadata for filtering, then loads full file for selected one)
    async getRandomFile(filters = {}) {
        try {
            // Use the optimized getRandomFileId
            const randomId = await this.getRandomFileId(filters);
            
            if (!randomId) {
                return null;
            }

            // Only now load the full file for the selected one
            const file = await this.loadFileById(randomId);
            
            if (!file) {
                return null;
            }
            
            // Return file information without the path
            return {
                id: file.id,
                name: file.name,
                type: file.type,
                size: file.size,
                created: file.created,
                modified: file.modified,
                tags: file.tags,
                folders: file.folders,
                ext: file.ext,
                width: file.width,
                height: file.height
            };
        } catch (error) {
            console.error('Error getting random file:', error);
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

                let pathname = '/';
                let searchParams = new URLSearchParams();
                
                try {
                    const url = new URL(req.url, `http://localhost:${this.port}`);
                    pathname = url.pathname;
                    searchParams = url.searchParams;
                } catch (error) {
                    console.error('Error parsing URL:', error, 'req.url:', req.url);
                    // Fallback: parse manually
                    const urlParts = req.url.split('?');
                    pathname = urlParts[0] || '/';
                    if (urlParts[1]) {
                        searchParams = new URLSearchParams(urlParts[1]);
                    }
                }

                // Handle async routes - check in order of specificity
                if (pathname.startsWith('/files/') && pathname.split('/').length > 2) {
                    const fileId = pathname.split('/')[2];
                    this.handleFileById(req, res, fileId).catch(err => {
                        console.error('Error in handleFileById:', err);
                        if (!res.headersSent) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, error: 'Internal server error' }));
                        }
                    });
                    return;
                }
                
                if (pathname === '/getList' || pathname === '/getList/') {
                    this.handleGetList(req, res, searchParams).catch(err => {
                        console.error('Error in handleGetList:', err);
                        if (!res.headersSent) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, error: 'Internal server error' }));
                        }
                    });
                    return;
                }
                
                if (pathname === '/getRandom' || pathname === '/getRandom/') {
                    this.handleGetRandom(req, res, searchParams).catch(err => {
                        console.error('Error in handleGetRandom:', err);
                        if (!res.headersSent) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, error: 'Internal server error' }));
                        }
                    });
                    return;
                }
                
                if (pathname === '/getRandomMedia' || pathname === '/getRandomMedia/') {
                    this.handleGetRandomMedia(req, res, searchParams).catch(err => {
                        console.error('Error in handleGetRandomMedia:', err);
                        if (!res.headersSent) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, error: 'Internal server error' }));
                        }
                    });
                    return;
                }
                
                // Default response
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    status: 'ok', 
                    message: 'Eagle File Server',
                    port: this.port,
                    eagleDataPath: this.eagleDataPath,
                    endpoints: {
                        getList: '/getList?limit=10&offset=0&orderBy=random&keyword=&ext=&tags=&folders=',
                        getRandom: '/getRandom?keyword=&ext=&tags=&folders=',
                        getRandomMedia: '/getRandomMedia?keyword=&ext=&tags=&folders=',
                        fileById: '/files/{fileId}'
                    }
                }));
            });

            this.server.listen(this.port, () => {
                this.isRunning = true;
                console.log(`🚀 Eagle File Server running on http://localhost:${this.port}`);
                console.log(`📁 Eagle data path: ${this.eagleDataPath}`);
                console.log(`🔗 Health check: http://localhost:${this.port}/`);
                console.log(`📁 File serving: http://localhost:${this.port}/files/{fileId}`);
                console.log(`📋 Get list: http://localhost:${this.port}/getList`);
                console.log(`🎲 Get random ID: http://localhost:${this.port}/getRandom`);
                console.log(`🎲 Get random media: http://localhost:${this.port}/getRandomMedia`);
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

    async handleGetList(req, res, searchParams) {
        try {
            const filters = {
                limit: searchParams.get('limit'),
                offset: searchParams.get('offset'),
                orderBy: searchParams.get('orderBy'),
                keyword: searchParams.get('keyword'),
                ext: searchParams.get('ext'),
                tags: searchParams.get('tags'),
                folders: searchParams.get('folders')
            };

            const result = await this.getFileList(filters);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                data: result
            }));
        } catch (error) {
            console.error('Error handling getList:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: 'Internal server error'
            }));
        }
    }

    async handleGetRandom(req, res, searchParams) {
        try {
            const filters = {
                keyword: searchParams.get('keyword'),
                ext: searchParams.get('ext'),
                tags: searchParams.get('tags'),
                folders: searchParams.get('folders')
            };

            const file = await this.getRandomFile(filters);
            
            if (!file) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: 'No matching files found'
                }));
                return;
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                data: file
            }));
        } catch (error) {
            console.error('Error handling getRandom:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: 'Internal server error'
            }));
        }
    }

    async handleGetRandomMedia(req, res, searchParams) {
        try {
            const filters = {
                keyword: searchParams.get('keyword'),
                ext: searchParams.get('ext'),
                tags: searchParams.get('tags'),
                folders: searchParams.get('folders')
            };

            // Get a random file ID
            const randomId = await this.getRandomFileId(filters);
            
            if (!randomId) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: 'No matching files found'
                }));
                return;
            }

            // Load and stream the file (same as handleFileById)
            const file = await this.loadFileById(randomId);
            
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
        } catch (error) {
            console.error('Error handling getRandomMedia:', error);
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: 'Internal server error'
                }));
            }
        }
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