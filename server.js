require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const os = require('os'); // 👈 IP එක Auto-Detect කිරීමට os module එක
const { spawn } = require('child_process');
const cron = require('node-cron');

const app = express();

app.use(cors());
app.use(cookieParser()); // 🍪 කුකීස් කියවීම සඳහා Middleware එක
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 🚀 Active Wi-Fi/Ethernet Network IP එක Auto සොයාගන්නා Engine එක
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const interfaceName in interfaces) {
        for (const net of interfaces[interfaceName]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
}

const NETWORK_IP = getLocalIP(); // 🎯 Computer එකේ වත්මන් Wi-Fi IP එක Auto ගනී

const jsFolder = path.join(__dirname, 'js');
const rootTemplatesDir = path.join(__dirname, 'video_templates');
const uploadDir = path.join(__dirname, 'public', 'uploads');
const outputDir = path.join(__dirname, 'public', 'outputs');
const trackersFolder = path.join(__dirname, 'trackers');

if (!fs.existsSync(jsFolder)) fs.mkdirSync(jsFolder, { recursive: true });
if (!fs.existsSync(rootTemplatesDir)) fs.mkdirSync(rootTemplatesDir, { recursive: true });
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
if (!fs.existsSync(trackersFolder)) fs.mkdirSync(trackersFolder, { recursive: true });

// 📁 Static Assets Routing Maps
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/sources', express.static(path.join(__dirname, 'views', 'sources')));
app.use('/views', express.static(path.join(__dirname, 'views')));
app.use('/video_templates', express.static(rootTemplatesDir));
app.use('/image_templates', express.static(rootTemplatesDir));
app.use('/web_images', express.static(path.join(__dirname, 'web_images')));

// 🎯 DYNAMIC ENV CONFIGURATION & AUTO IP LINKING
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PYTHON_PORT = process.env.PYTHON_PORT || 3001;
const ULF_PORT = process.env.ULF_PORT || 5001;

// Auto Network IP Link Assembly
const AUTH_SERVER = process.env.AUTH_SERVER || `http://${NETWORK_IP}:${ULF_PORT}`;
const PAGE_LINK = process.env.PAGE_LINK || `http://${NETWORK_IP}:${PORT}/home`;
const SHARE_LINK = process.env.SHARE_LINK || `http://${NETWORK_IP}:${ULF_PORT}/views/ulf_storage/Cards/`;
const pythonTarget = process.env.PYTHON_SERVER_URL || `http://${NETWORK_IP}:3001`;
// =================================================================
// 🎯 LAYOUT COMPILER ENGINE WITH GLOBAL PLACEHOLDER & COOKIE INJECTION
// =================================================================
const renderWithLayout = (pageName, req, res) => {
    const requestedPagePath = path.join(__dirname, 'views', `${pageName}.html`);
    const headerPath = path.join(__dirname, 'views', 'header.html');
    const footerPath = path.join(__dirname, 'views', 'footer.html');

    if (fs.existsSync(requestedPagePath)) {
        try {
            let htmlContent = fs.readFileSync(requestedPagePath, 'utf8');
            if (fs.existsSync(headerPath)) htmlContent = htmlContent.replace('{{HEADER}}', fs.readFileSync(headerPath, 'utf8'));
            if (fs.existsSync(footerPath)) htmlContent = htmlContent.replace('{{FOOTER}}', fs.readFileSync(footerPath, 'utf8'));
            else htmlContent = htmlContent.replace('{{FOOTER}}', '');

            // Global Dynamic Variables Inject කිරීම
            htmlContent = htmlContent.replaceAll('{{AUTH_SERVER}}', AUTH_SERVER);
            htmlContent = htmlContent.replaceAll('{{PAGE_LINK}}', PAGE_LINK);
            htmlContent = htmlContent.replaceAll('{{SHARE_LINK}}', SHARE_LINK);
            htmlContent = htmlContent.replaceAll('{{PYTHON_PORT}}', pythonTarget);

            // 💡 මොබයිල් එකෙන් එනකොට HTML පිටුවල ඇති JavaScript වලට සැබෑ IP එක inject කිරීම
            //htmlContent = htmlContent.replace('const CURRENT_HOST = window.location.hostname;', `const CURRENT_HOST = "${NETWORK_IP}";`);

            // 🚀 NEW COOKIE LOGIC: කුකියෙන් Pro User කෙනෙක්ද කියා බලා HTML එකට Data Attribute එකක් Inject කිරීම
            const isProUser = (req.cookies && req.cookies.user_role === 'pro') ? 'true' : 'false';
            htmlContent = htmlContent.replace('<body', `<body data-user-pro="${isProUser}"`);

            return res.send(htmlContent);
        } catch (err) {
            console.error("❌ Component Compiler Error:", err.message);
            return res.status(500).send("Component Compiler Error");
        }
    }
    res.status(404).send(`${pageName}.html not found in views.`);
};

// 🎯 PRETTIER UI ROUTES FOR DESIGNER TOOLS & CARDMAKER SUITE
app.get('/', (req, res) => renderWithLayout('home', req, res));
app.get('/designertools', (req, res) => renderWithLayout('designertools', req, res));
app.get('/designertools/tracking', (req, res) => renderWithLayout('videotrackingmaker', req, res));
app.get('/designertools/editor', (req, res) => renderWithLayout('videocardseditor', req, res));
app.get('/designertools/test', (req, res) => renderWithLayout('videotest', req, res));

// 🎯 NEW PRODUCTION SUITE & CARDMAKER PAGES
app.get('/designertools/builder', (req, res) => renderWithLayout('template_builder', req, res));

// 💡 UPDATE: /home එකට එද්දී auth server එකෙන් එවන query param එකෙන් කුකිය Lock කිරීම සහ Role එක Detect කිරීම
app.get('/home', (req, res) => {
    if (req.query.user_id) {
        res.cookie('main_user_id', req.query.user_id, { maxAge: 24 * 60 * 60 * 1000 });  
        console.log(`[CardApp Server] 🍪 Cookie locked for User ID: ${req.query.user_id}`);
    }
    
    const currentRole = (req.cookies && req.cookies.user_role) ? req.cookies.user_role : 'regular';
    console.log(`[CardApp Server] User arrived on /home. Detected Role: ${currentRole}`);

    renderWithLayout('home', req, res);
});

app.get('/cards', (req, res) => renderWithLayout('home', req, res));
app.get('/cards/card', (req, res) => renderWithLayout('card', req, res));
app.get('/cards/multi', (req, res) => renderWithLayout('multi_generate', req, res));

// =================================================================
// 📊 GLOBAL SOCIAL SHARE CLICK TRACKER ENGINE (WITH JSON FILE SAVING)
// =================================================================
const clicksFilePath = path.join(__dirname, 'share_clicks.json');

// 1. Fetch Total Share Clicks
app.get('/api/analytics/share-stats', (req, res) => {
    if (!fs.existsSync(clicksFilePath)) return res.json({ success: true, stats: {} });
    try {
        const stats = JSON.parse(fs.readFileSync(clicksFilePath, 'utf8'));
        res.json({ success: true, stats });
    } catch (e) {
        res.json({ success: true, stats: {} });
    }
});

// 2. Track & Increment Click Count and Write to share_clicks.json
app.post('/api/analytics/track-share', (req, res) => {
    const { platform } = req.body;
    if (!platform) return res.status(400).json({ success: false, error: "Platform required" });

    let data = {};
    if (fs.existsSync(clicksFilePath)) {
        try { 
            data = JSON.parse(fs.readFileSync(clicksFilePath, 'utf8')); 
        } catch (e) {
            data = {};
        }
    }

    // Global Key එක (උදා: global_whatsapp, global_facebook)
    const key = `global_${platform}`;
    data[key] = (data[key] || 0) + 1;

    try {
        fs.writeFileSync(clicksFilePath, JSON.stringify(data, null, 2));
        console.log(`📊 [Analytics] Tracked ${platform} click. Total: ${data[key]}`);
        res.json({ success: true, count: data[key], platform: platform });
    } catch (err) {
        console.error("❌ Failed to write share_clicks.json:", err.message);
        res.status(500).json({ success: false, error: "File write error" });
    }
});

// =================================================================
// 🎯 DYNAMIC MULTI-LAYOUT COMPILER ENGINE (AUTOMATED MIDDLEWARE)
// =================================================================
app.get('/:page.html', (req, res, next) => {
    const pageName = req.params.page;
    if (pageName === 'header' || pageName === 'footer') return next();
    renderWithLayout(pageName, req, res);
});

// =================================================================
// Anti-Jam Queue Framework Execution Core
// =================================================================
let renderingQueue = [];
let isProcessing = false;

app.locals.addToQueue = function(task) {
    renderingQueue.push(task);
    if (!isProcessing) processNextQueueItem();
};

function processNextQueueItem() {
    if (renderingQueue.length === 0) { isProcessing = false; return; }
    isProcessing = true;
    const nextTask = renderingQueue.shift();
    const { exec } = require('child_process');
    
    console.log(`🎬 Running Pipeline Execution Node for: ${nextTask.themeName}`);
    
    exec(nextTask.command, (err, stdout, stderr) => {
        nextTask.tempFiles.forEach(filePath => { 
            try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch(e) {}
        });
        try { if (fs.existsSync(nextTask.manifestPath)) fs.unlinkSync(nextTask.manifestPath); } catch(e) {}
        
        isProcessing = false;
        
        if (err) {
            console.error(`❌ Python Pipeline Error Output:`, stderr || err);
            if (!nextTask.res.headersSent) {
                return nextTask.res.status(500).json({ success: false, error: "Python logic or asset path failure." });
            }
        }
        
        if (!nextTask.res.headersSent) {
            nextTask.res.json({ success: true, videoUrl: `/public/outputs/${nextTask.outputName}` });
        }
        processNextQueueItem();
    });
}

const trackingMakerRouter = require('./js/videotrackingmaker');
const cardsEditorRouter = require('./js/videocardseditor');
app.use('/', trackingMakerRouter);
app.use('/', cardsEditorRouter);

app.locals.registerDynamicRoute = function(jsFilePath) {
    try {
        const dynamicModule = require(jsFilePath);
        app.use('/api', dynamicModule); 
        console.log(`🔗 Injected dynamic custom card route under /api: ${path.basename(jsFilePath)}`);
    } catch (e) {
        console.error(`❌ Route loading exception for file ${jsFilePath}:`, e);
    }
};

// =================================================================
// ⏰ AUTOMATIC FILE CLEANUP CRON ENGINE (EVERY 10 MINUTES)
// =================================================================
function cleanFilesInDirectory(targetDir, maxAgeMs) {
    if (!fs.existsSync(targetDir)) return;  

    fs.readdir(targetDir, (err, files) => {
        if (err) return console.error(`[Cleanup Engine] Error reading ${targetDir}:`, err);  

        const now = Date.now();  

        files.forEach(file => {
            const filePath = path.join(targetDir, file);  
            
            fs.stat(filePath, (err, stats) => {
                if (err) return;  

                // ෆයිල් එකක් පමණක් නම් සහ විනාඩි 30 ට වඩා පරණ නම් මකා දැමීම
                if (stats.isFile() && (now - stats.mtimeMs > maxAgeMs)) {  
                    fs.unlink(filePath, (err) => {
                        if (err) console.error(`[Cleanup Engine] Failed to delete: ${file}`, err);  
                        else console.log(`🗑️ Auto-Cleared File: ${filePath}`);  
                    });
                }
            });
        });
    });
}

cron.schedule('*/10 * * * *', () => {
    // විනාඩි 30 (මිලි තත්පර වලින්)
    const THIRTY_MINUTES = 30 * 60 * 1000;  

    // 🎯 1. Public Folder එකේ ඇති Outputs සහ Uploads ෆෝල්ඩර්ස්
    let directoriesToClean = [
        path.join(__dirname, 'public', 'outputs'),
        path.join(__dirname, 'public', 'uploads')
    ];

    console.log(`[Cleanup Engine] Running scheduled auto-clear for ${directoriesToClean.length} directories...`);  
    directoriesToClean.forEach(dir => {
        cleanFilesInDirectory(dir, THIRTY_MINUTES);  
    });
});

app.listen(PORT, HOST, () => {
    console.log(`======================================================`);
    console.log(`🚀 CARD APP SERVER ONLINE: http://${NETWORK_IP}:${PORT}`);
    console.log(`📱 AUTH SERVER TARGET: ${AUTH_SERVER}`);
    console.log(`======================================================`);

    fs.readdirSync(jsFolder).forEach(file => {
        if (file.endsWith('.js') && file !== 'videotrackingmaker.js' && file !== 'videocardseditor.js') {
            app.locals.registerDynamicRoute(path.join(jsFolder, file));
        }
    });
});
