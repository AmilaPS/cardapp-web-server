require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const os = require('os');
const multer = require('multer');
const { spawn } = require('child_process');
const cron = require('node-cron');

const app = express();

app.use(cors());
app.use(cookieParser());
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

const NETWORK_IP = getLocalIP();

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
// 🔐 SECURE SSO TOKEN AUTH MIDDLEWARE
// =================================================================
const checkAuth = async (req, res, next) => {
    let userId = req.cookies ? req.cookies.main_user_id : null;

    // 1. SSO Token එකක් පැමිණ ඇති විට (Cookies නොමැති නම්)
    if (!userId && req.query.token) {
        try {
            const verifyRes = await axios.get(`${AUTH_SERVER}/api/auth/verify-token?token=${req.query.token}`);
            if (verifyRes.data && verifyRes.data.valid) {
                userId = verifyRes.data.user_id;
                const userRole = verifyRes.data.user_role || 'User';

                const cookieOptions = {
                    maxAge: 4 * 60 * 60 * 1000,
                    path: '/',
                    sameSite: 'lax'
                };

                res.cookie('main_user_id', userId, cookieOptions);
                res.cookie('user_role', userRole, cookieOptions);

                // 🚀 මෙතැනදී Log එක සටහන් කර සෘජුවම Redirect කරයි
                console.log(`✅ [CardApp Server] SSO Verified & Logged In: User ID: ${userId} | Role: ${userRole}`);
                return res.redirect('/home');
            }
        } catch (err) {
            console.log("❌ Invalid or expired SSO Token attempt!");
        }
    }

    // 2. Cookie එකක් නොමැති නම් සෘජුවම Login පිටුවට Redirect කරයි
    if (!userId || userId === 'null' || userId === 'undefined') {
        console.log("⚠️ User not logged in! Redirecting to Auth Server...");
        return res.redirect(`${AUTH_SERVER}/mypersonello/login`);
    }

    // 3. Cookie එක හරහා සාර්ථකව Page එකට පිවිසෙන සෑම අවස්ථාවකම Log එක පෙන්වීමට:
    console.log(`👤 [CardApp Server] Active Session: User ID: ${userId}`);
    next();
};

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

            const isAdminUser = (req.cookies && req.cookies.user_role === 'Admin') ? 'true' : 'false';
            htmlContent = htmlContent.replace('<body', `<body data-user-admin="${isAdminUser}"`);

            return res.send(htmlContent);
        } catch (err) {
            console.error("❌ Component Compiler Error:", err.message);
            return res.status(500).send("Component Compiler Error");
        }
    }
    res.status(404).send(`${pageName}.html not found in views.`);
};

// 🚪 LOGOUT ENGINE (Local Cookies Clear කර Auth Server එකට Redirect කිරීම)
app.get('/logout', (req, res) => {
    res.clearCookie('main_user_id', { path: '/' });
    res.clearCookie('user_role', { path: '/' });
    console.log("🚪 [CardApp Server] Local user cookies cleared successfully.");
    return res.redirect(`${AUTH_SERVER}/logout`);
});

// 🚪 CARDAPP COOKIE CLEARING BRIDGE ROUTE
app.get('/cardapp_clear_cookie', (req, res) => {
    // Express Cookies සාර්ථකව Delete කිරීම
    res.clearCookie('main_user_id', { path: '/' });
    res.clearCookie('user_role', { path: '/' });
    
    // Cookie Header එක මඟින් සාර්ථකව Clear වූ බව තහවුරු කිරීම
    res.setHeader('Set-Cookie', [
        'main_user_id=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly',
        'user_role=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly'
    ]);

    console.log("🚪 [CardApp Server] Local user cookies cleared successfully via Redirect Bridge.");
    
    // Auth Server එකේ Direct Login Page එකට යවයි
    return res.redirect(`${AUTH_SERVER}/mypersonello/login`);
});

// =================================================================
// 📸 IMAGE SLOTS MANAGEMENT API (CARDAPP ROOT \web_images FOLDER)
// =================================================================
const webImagesDir = path.join(__dirname, 'web_images');
if (!fs.existsSync(webImagesDir)) fs.mkdirSync(webImagesDir, { recursive: true });

const slotStorage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, webImagesDir); },
    filename: (req, file, cb) => {
        // 🎯 req.body.slot_no නැත්නම් පමණක් '01' ගනියි
        const slotNo = req.body.slot_no || '01';
        const field = file.fieldname;
        
        // 🎯 Upload කරන Original Extension එක (.svg, .png, .jpg) ඒ ආකාරයෙන්ම තබා ගනී
        const ext = path.extname(file.originalname).toLowerCase() || '.png';
        
        let prefix = 'thumb_';
        if (field === 'crop_file') prefix = 'crop';
        else if (field === 'cropb_file') prefix = 'cropb';

        // 🎯 වෙනත් Extension එකකින් පැරණි ගොනුවක් තිබුනොත් (e.g. thumb_07.png තිබියදී thumb_07.svg Upload කලොත්) පැරණි එක Delete කරයි
        const targetPattern = new RegExp(`^${prefix}${slotNo}\\.(png|jpg|jpeg|svg)$`, 'i');
        if (fs.existsSync(webImagesDir)) {
            fs.readdirSync(webImagesDir).forEach(f => {
                if (targetPattern.test(f)) {
                    try { fs.unlinkSync(path.join(webImagesDir, f)); } catch(e) {}
                }
            });
        }

        cb(null, `${prefix}${slotNo}${ext}`);
    }
});
const uploadSlot = multer({ storage: slotStorage });

// 1. GET ALL EXISTING SLOTS FROM \web_images
app.get('/api/slots', (req, res) => {
    try {
        if (!fs.existsSync(webImagesDir)) return res.json({ success: true, slots: [] });
        
        const files = fs.readdirSync(webImagesDir);
        const slotMap = new Map();

        files.forEach(file => {
            // 🎯 RegEx එක Underscore සහිත හෝ නැති ක්‍රම දෙකටම ගැලපෙන සේ සැකසුවා
            // Match 1: thumb_01 OR crop01 / cropb01 OR crop_01 / cropb_01
            const match = file.match(/^(thumb_?|cropb_?|crop_?)(\d+)\.(png|jpg|jpeg|svg)$/i);
            if (match) {
                let prefix = match[1].toLowerCase().replace('_', ''); // 'thumb', 'crop', 'cropb'
                const num = match[2]; // e.g. "01", "02", "07"
                
                if (!slotMap.has(num)) {
                    slotMap.set(num, { slot: num, thumb: 'none', crop: 'none', cropb: 'none' });
                }
                const slotData = slotMap.get(num);
                if (prefix === 'thumb') slotData.thumb = file;
                if (prefix === 'crop') slotData.crop = file;
                if (prefix === 'cropb') slotData.cropb = file;
            }
        });

        const sortedSlots = Array.from(slotMap.values()).sort((a, b) => parseInt(a.slot) - parseInt(b.slot));
        res.json({ success: true, slots: sortedSlots });
    } catch (err) {
        console.error("Error reading web_images slots:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. UPLOAD & REPLACE SLOT IMAGES
app.post('/api/slots/upload', uploadSlot.fields([
    { name: 'thumb_file', maxCount: 1 },
    { name: 'crop_file', maxCount: 1 },
    { name: 'cropb_file', maxCount: 1 }
]), (req, res) => {
    try {
        const slotNo = req.body.slot_no;
        if (!slotNo) return res.status(400).json({ success: false, error: "Slot number required" });
        
        console.log(`📸 [CardApp] Updated Slot Images in \\web_images for Slot: ${slotNo}`);
        res.json({ success: true, message: `Slot ${slotNo} images updated successfully.` });
    } catch (err) {
        console.error("Slot upload error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. DELETE ENTIRE SLOT (thumb_##, crop##, cropb##)
app.delete('/api/slots/:slot_no', (req, res) => {
    try {
        const slotNo = req.params.slot_no;
        if (!fs.existsSync(webImagesDir)) return res.json({ success: true });

        const files = fs.readdirSync(webImagesDir);
        files.forEach(file => {
            const match = file.match(/^(thumb_?|cropb_?|crop_?)(\d+)\.(png|jpg|jpeg|svg)$/i);
            if (match && match[2] === slotNo) {
                const filePath = path.join(webImagesDir, file);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log(`🗑️ Deleted Slot File: ${file}`);
                }
            }
        });

        res.json({ success: true, message: `Slot ${slotNo} files deleted.` });
    } catch (err) {
        console.error("Slot delete error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 🎯 PRETTIER UI ROUTES (Auth Secured)
app.get('/', checkAuth, (req, res) => renderWithLayout('home', req, res));
app.get('/home', checkAuth, (req, res) => renderWithLayout('home', req, res));
app.get('/cards', checkAuth, (req, res) => renderWithLayout('home', req, res));
app.get('/cards/card', checkAuth, (req, res) => renderWithLayout('card', req, res));
app.get('/cards/multi', checkAuth, (req, res) => renderWithLayout('multi_generate', req, res));

// 🛠️ DESIGNER TOOLS ROUTES
app.get('/designertools', (req, res) => renderWithLayout('designertools', req, res));
app.get('/designertools/tracking', (req, res) => renderWithLayout('videotrackingmaker', req, res));
app.get('/designertools/editor', (req, res) => renderWithLayout('videocardseditor', req, res));
app.get('/designertools/test', (req, res) => renderWithLayout('videotest', req, res));
app.get('/designertools/builder', (req, res) => renderWithLayout('template_builder', req, res));

// =================================================================
// 📊 GLOBAL SOCIAL SHARE CLICK TRACKER ENGINE
// =================================================================
const clicksFilePath = path.join(__dirname, 'share_clicks.json');

app.get('/api/analytics/share-stats', (req, res) => {
    if (!fs.existsSync(clicksFilePath)) return res.json({ success: true, stats: {} });
    try {
        const stats = JSON.parse(fs.readFileSync(clicksFilePath, 'utf8'));
        res.json({ success: true, stats });
    } catch (e) {
        res.json({ success: true, stats: {} });
    }
});

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
// 🎯 DYNAMIC MULTI-LAYOUT COMPILER ENGINE
// =================================================================
app.get('/:page.html', checkAuth, (req, res, next) => {
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

// =================================================================
// 🚀 DYNAMIC HOT-RELOAD ROUTER DISPATCHER (NO PM2 / NO REBOOT NEEDED)
// =================================================================
app.use('/api', (req, res, next) => {
    // Request URL එකෙන් Card Theme Name එක වෙන්කර ගැනීම (e.g., /api/valentine_card_1 -> valentine_card_1)
    const subPath = req.path.split('/')[1]; 
    if (!subPath) return next();

    const jsFilePath = path.join(jsFolder, `${subPath}.js`);

    // js/ ෆෝල්ඩරයේ මෙයට අදාළ Custom Dynamic JS File එකක් නැත්නම් වෙනත් Routes (e.g. /api/themes, /api/slots) සඳහා pass කරයි
    if (!fs.existsSync(jsFilePath)) {
        return next();
    }

    try {
        const resolvedPath = path.resolve(jsFilePath);
        const normalizedPath = resolvedPath.replace(/\\/g, '/').toLowerCase();

        // 1. Node.js Require Cache එක Case-Insensitive ලෙස Memory එකෙන් Instant Purge කිරීම
        Object.keys(require.cache).forEach(key => {
            if (key.replace(/\\/g, '/').toLowerCase() === normalizedPath) {
                delete require.cache[key];
            }
        });

        // 2. Disk එකේ ඇති අලුත්ම JS Router Module එක Fresh Require කිරීම
        const dynamicRouter = require(resolvedPath);

        // 3. Request එක සෘජුවම අලුත් Router එකට භාරදීම
        return dynamicRouter(req, res, next);
    } catch (err) {
        console.error(`❌ Dynamic route hot-reload execution error for ${subPath}:`, err);
        return res.status(500).json({ success: false, error: "Dynamic route execution error: " + err.message });
    }
});

const trackingMakerRouter = require('./js/videotrackingmaker');
const cardsEditorRouter = require('./js/videocardseditor');
app.use('/', trackingMakerRouter);
app.use('/', cardsEditorRouter);

app.locals.registerDynamicRoute = function(jsFilePath) {
    try {
        const resolvedPath = path.resolve(jsFilePath);
        const normalizedPath = resolvedPath.replace(/\\/g, '/').toLowerCase();
        
        Object.keys(require.cache).forEach(key => {
            if (key.replace(/\\/g, '/').toLowerCase() === normalizedPath) {
                delete require.cache[key];
            }
        });
        console.log(`♻️ [Cache Purged] Dynamic card route ready: ${path.basename(jsFilePath)}`);
    } catch (e) {
        console.error(`❌ Route cache purge exception for file ${jsFilePath}:`, e);
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
    const THIRTY_MINUTES = 30 * 60 * 1000;  

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