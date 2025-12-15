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
            // Get Eagle library path using the Eagle API (still needed for file serving)
            this.eagleDataPath = eagle.library.path;
            
            console.log('Starting Eagle File Server...');
            console.log(`Eagle library path: ${this.eagleDataPath || 'using Eagle API'}`);
            
            // Test Eagle API access
            try {
                const testItems = await eagle.item.get({ ids: [] });
                console.log(`Eagle API accessible. Found ${testItems?.length || 0} items in library.`);
            } catch (apiError) {
                console.warn('Eagle API test failed:', apiError.message);
            }
            
            this.startHTTPServer();
            console.log('Eagle File Server ready');
        } catch (error) {
            console.error('Failed to initialize Eagle File Server:', error);
            console.error('Error details:', error.message);
            console.error('Stack trace:', error.stack);
        }
    }

    // Convert Eagle item to our file format
    convertEagleItemToFile(item) {
        if (!item) return null;
        
        const ext = (item.ext || '').toLowerCase();
        const fileName = item.name || item.fileName || item.title || '';
        
        // Try multiple possible path properties
        let filePath = item.filePath || item.path || item.file || '';
        
        // If path is relative or empty, try to construct it from library path
        if (!filePath && this.eagleDataPath) {
            // Fallback: construct path from library structure
            const imagesPath = path.join(this.eagleDataPath, 'images');
            const itemDir = `${item.id}.info`;
            filePath = path.join(imagesPath, itemDir, fileName);
        }
        
        return {
            id: item.id,
            name: fileName,
            path: filePath,
            type: this.getFileType(ext),
            size: item.size || item.fileSize || 0,
            created: item.dateCreated ? new Date(item.dateCreated).toISOString() : 
                     item.created ? new Date(item.created).toISOString() : 
                     new Date().toISOString(),
            modified: item.dateModified ? new Date(item.dateModified).toISOString() : 
                      item.modified ? new Date(item.modified).toISOString() : 
                      new Date().toISOString(),
            tags: item.tags || [],
            folders: item.folders || [],
            ext: ext,
            width: item.width || null,
            height: item.height || null,
            metadata: item
        };
    }

    async loadFileById(fileId) {
        try {
            // Use Eagle's API to get the item by ID
            const item = await eagle.item.getById(fileId);
            
            if (!item) {
                console.warn(`File not found via Eagle API: ${fileId}`);
                return null;
            }
            
            return this.convertEagleItemToFile(item);
            
        } catch (error) {
            console.error(`Error loading file ${fileId}:`, error);
            console.error('Error message:', error.message);
            return null;
        }
    }

    // Get all items using Eagle's API
    async getAllItems(filters = {}) {
        try {
            // Parse extensions - Eagle API only supports one extension at a time
            let extensions = [];
            if (filters.ext && filters.ext.trim()) {
                const extString = filters.ext.trim();
                // Split by comma and clean up each extension
                extensions = extString.split(',')
                    .map(ext => ext.trim())
                    .filter(ext => ext)
                    .map(ext => {
                        // Remove leading dot if present (Eagle API expects format like "jpg" not ".jpg")
                        return ext.startsWith('.') ? ext.substring(1) : ext;
                    });
            }
            
            // Build base query without extension (since we handle extensions separately)
            const baseQuery = {};
            
            // Keywords - array of strings
            if (filters.keyword && filters.keyword.trim()) {
                baseQuery.keywords = [filters.keyword.trim()];
            }
            
            // Tags - array of strings
            if (filters.tags) {
                const tagsArray = Array.isArray(filters.tags) 
                    ? filters.tags 
                    : filters.tags.split(',').map(t => t.trim()).filter(t => t);
                if (tagsArray.length > 0) {
                    baseQuery.tags = tagsArray;
                }
            }
            
            // Folders - array of strings
            if (filters.folders) {
                const foldersArray = Array.isArray(filters.folders)
                    ? filters.folders
                    : filters.folders.split(',').map(f => f.trim()).filter(f => f);
                if (foldersArray.length > 0) {
                    baseQuery.folders = foldersArray;
                }
            }
            
            // If no extensions specified, make a single query
            if (extensions.length === 0) {
                console.log('Eagle API query:', JSON.stringify(baseQuery, null, 2));
                const items = await eagle.item.get(baseQuery);
                console.log(`Eagle API returned ${items?.length || 0} items`);
                return items || [];
            }
            
            // If multiple extensions, query each one separately and combine results
            const allItems = [];
            const seenIds = new Set(); // To avoid duplicates
            
            for (const ext of extensions) {
                const query = { ...baseQuery, ext: ext };
                console.log(`Eagle API query for ext "${ext}":`, JSON.stringify(query, null, 2));
                const items = await eagle.item.get(query);
                console.log(`Eagle API returned ${items?.length || 0} items for ext "${ext}"`);
                
                if (items && items.length > 0) {
                    for (const item of items) {
                        if (!seenIds.has(item.id)) {
                            seenIds.add(item.id);
                            allItems.push(item);
                        }
                    }
                }
            }
            
            console.log(`Total combined items: ${allItems.length}`);
            return allItems;
        } catch (error) {
            console.error('Error getting items from Eagle API:', error);
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
            return [];
        }
    }

    // Sort files based on orderBy parameter
    sortFiles(files, orderBy) {
        // Default to random if no orderBy specified
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
                // Default to random
                for (let i = files.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [files[i], files[j]] = [files[j], files[i]];
                }
                return files;
        }
    }

    // Get list of files with filtering and pagination
    async getFileList(filters = {}) {
        try {
            console.log('getFileList called with filters:', JSON.stringify(filters, null, 2));
            
            // Get items from Eagle API with filters
            const items = await this.getAllItems(filters);
            console.log(`getAllItems returned ${items.length} items`);
            
            // Convert Eagle items to our file format
            const files = items
                .map(item => this.convertEagleItemToFile(item))
                .filter(file => file !== null);
            
            console.log(`After conversion: ${files.length} files`);

            // Sort files
            const sortedFiles = this.sortFiles([...files], filters.orderBy);

            // Apply pagination
            const limit = parseInt(filters.limit) || 100;
            const offset = parseInt(filters.offset) || 0;
            const paginatedFiles = sortedFiles.slice(offset, offset + limit);

            // Return only file information, not the full file object
            const fileInfo = paginatedFiles.map(file => ({
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
            }));

            console.log(`Returning ${fileInfo.length} files (total: ${sortedFiles.length}, limit: ${limit}, offset: ${offset})`);

            return {
                files: fileInfo,
                total: sortedFiles.length,
                limit: limit,
                offset: offset
            };
        } catch (error) {
            console.error('Error getting file list:', error);
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
            throw error; // Re-throw to let the handler provide better error messages
        }
    }

    // Get a random file ID using Eagle's API
    async getRandomFileId(filters = {}) {
        try {
            // Get all matching items from Eagle API
            const items = await this.getAllItems(filters);
            
            if (items.length === 0) {
                return null;
            }

            // Randomly select one item
            const randomIndex = Math.floor(Math.random() * items.length);
            return items[randomIndex].id;
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
                    eagleDataPath: this.eagleDataPath || 'using Eagle API',
                    usingEagleAPI: true,
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
        try {
            if (!this.eagleDataPath) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    success: false, 
                    error: 'Library path not configured',
                    libraryPath: 'not set'
                }));
                return;
            }
            
            const file = await this.loadFileById(fileId);
            
            if (!file) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'File not found' }));
                return;
            }

            const filePath = file.path;
            if (!fs.existsSync(filePath)) {
                console.error(`File path does not exist: ${filePath}`);
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    success: false, 
                    error: 'File not found on disk',
                    filePath: filePath,
                    libraryPath: this.eagleDataPath
                }));
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
                console.error('File path:', filePath);
                console.error('Error code:', error.code);
                if (!res.headersSent) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        success: false, 
                        error: 'Error reading file',
                        details: error.message,
                        code: error.code
                    }));
                }
            });
        } catch (error) {
            console.error('Error in handleFileById:', error);
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    success: false, 
                    error: 'Internal server error',
                    details: error.message
                }));
            }
        }
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
            const errorMessage = error.message || 'Internal server error';
            const statusCode = errorMessage.includes('not accessible') || errorMessage.includes('not configured') ? 503 : 500;
            res.writeHead(statusCode, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: errorMessage,
                usingEagleAPI: true
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
            if (!this.eagleDataPath) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    success: false, 
                    error: 'Library path not configured',
                    libraryPath: 'not set'
                }));
                return;
            }
            
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
                console.error(`File path does not exist: ${filePath}`);
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    success: false, 
                    error: 'File not found on disk',
                    filePath: filePath,
                    libraryPath: this.eagleDataPath
                }));
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
                console.error('File path:', filePath);
                console.error('Error code:', error.code);
                if (!res.headersSent) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        success: false, 
                        error: 'Error reading file',
                        details: error.message,
                        code: error.code
                    }));
                }
            });
        } catch (error) {
            console.error('Error handling getRandomMedia:', error);
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: 'Internal server error',
                    details: error.message
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