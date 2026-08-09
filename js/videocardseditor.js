const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const jsFolder = path.join(process.cwd(), 'js');
const trackersFolder = path.join(process.cwd(), 'trackers');
const rootTemplatesDir = path.join(process.cwd(), 'video_templates');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const rawThemeName = req.body.theme_name || file.fieldname || 'default_theme';
        const targetFolder = path.join(rootTemplatesDir, rawThemeName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'));
        if (!fs.existsSync(targetFolder)) fs.mkdirSync(targetFolder, { recursive: true });
        cb(null, targetFolder);
    },
    filename: (req, file, cb) => {
        cb(null, `tmpl_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`);
    }
});
const upload = multer({ storage: storage });

router.get('/api/themes', (req, res) => {
    if (!fs.existsSync(jsFolder)) return res.json([]);
    const files = fs.readdirSync(jsFolder).filter(f => f.endsWith('.js') && f !== 'videotrackingmaker.js' && f !== 'videocardseditor.js');
    res.json(files.map(f => ({ theme_name: f.replace('.js', ''), api_endpoint_url: `/api/${f.replace('.js', '')}` })));
});

router.get('/api/themes/meta/:name', (req, res) => {
    const targetPath = path.join(jsFolder, `${req.params.name}.js`);
    if (!fs.existsSync(targetPath)) return res.status(404).json({ error: "Missing file." });
    const fileContent = fs.readFileSync(targetPath, 'utf8');
    const bgMatch = fileContent.match(/const bgParamName = ['"](.+?)['"]/);
    const layersMatch = fileContent.match(/const trackingLayersConfig = (\[[\s\S]*?\]);/);
    let parsedLayers = [];
    if (layersMatch) { try { parsedLayers = JSON.parse(layersMatch[1]); } catch(e) {} }
    res.json({ bg_param_name: bgMatch ? bgMatch[1] : '', layers: parsedLayers });
});

router.post('/api/themes/update', upload.any(), async (req, res) => {
    try {
        const cleanName = req.body.theme_name; 
        const customApiUrl = req.body.api_url.trim();
        const parsedLayers = JSON.parse(req.body.layers_metadata);
        
        // 🎯 Route URL Clean Up (/api/ කොටස ඉවත් කර නිවැරදි sub-path එක සැකසීම)
        let routeSubPath = customApiUrl.replace(/^\/api/, '');
        if (!routeSubPath.startsWith('/')) routeSubPath = '/' + routeSubPath;

        const baseBgKey = req.body.bg_key.trim();
        const bgKey = baseBgKey.endsWith('_img') ? baseBgKey : `${baseBgKey}_img`;
        
        const jsFilename = `${cleanName}.js`;
        const pyFilename = `${cleanName}.py`;
        const fullJsPath = path.join(jsFolder, jsFilename);

        const finalLayers = parsedLayers.map((layer, index) => {
            const foundFile = req.files.find(f => f.fieldname === `video_layer_${index}`);
            const baseKey = layer.field_key.trim();
            const finalKey = baseKey.endsWith('_img') ? baseKey : `${baseKey}_img`;
            
            return { field_key: finalKey, tracking_video_name: foundFile ? foundFile.filename : layer.existing_video };
        });

        // 🎯 1. Python Cache (__pycache__) එක Auto-Purge කිරීම
        const pycacheDir = path.join(trackersFolder, '__pycache__');
        if (fs.existsSync(pycacheDir)) {
            try { fs.rmSync(pycacheDir, { recursive: true, force: true }); } catch(e) {}
        }

        // 2. Python Tracker Script එක Disk එකට Save කිරීම
        fs.writeFileSync(path.join(trackersFolder, pyFilename), generateDynamicPythonString(bgKey, finalLayers), 'utf8');

        // 3. Dynamic JS Module එක සකස් කිරීම
        const jsTemplateCode = `const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const bgParamName = '${bgKey}';
const trackingLayersConfig = ${JSON.stringify(finalLayers)};
const pythonEngineScript = '${pyFilename}';

const uploadDir = path.join(process.cwd(), 'public', 'uploads');
const outputDir = path.join(process.cwd(), 'public', 'outputs');
const templateDir = path.join(process.cwd(), 'video_templates', '${cleanName}');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, 'run_' + Date.now() + '_' + file.originalname)
});
const upload = multer({ storage: storage });

router.post('${routeSubPath}', upload.any(), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) return res.status(400).json({ error: "No files uploaded." });

        const bgFile = req.files.find(f => f.fieldname === bgParamName);
        if (!bgFile) return res.status(400).json({ error: 'Background asset missing' });
        
        let uploadedImagesPaths = [];
        let tempFilesToPurge = [bgFile.path];
        
        uploadedImagesPaths.push(bgFile.path);
        
        let missingField = null;
        for (const layer of trackingLayersConfig) {
            const matchingImage = req.files.find(f => f.fieldname === layer.field_key);
            if (matchingImage) {
                uploadedImagesPaths.push(matchingImage.path);
                tempFilesToPurge.push(matchingImage.path);
            } else {
                missingField = layer.field_key;
                break;
            }
        }

        if (missingField) {
            console.error("❌ Node Pipeline Blocked! Missing slot:", missingField);
            return res.status(400).json({ success: false, error: "Missing required image layer: " + missingField });
        }
        
        const uniqueOutputName = 'out_' + '${cleanName}_' + Date.now() + '.mp4';
        const outputPath = path.join(outputDir, uniqueOutputName);
        
        const pythonScriptPath = path.join(process.cwd(), 'trackers', pythonEngineScript);
        let args = ['"' + pythonScriptPath + '"'];
        uploadedImagesPaths.forEach(p => args.push('"' + p + '"'));
        args.push('"' + templateDir + '"');
        args.push('"' + outputPath + '"');
        
        // 🎯 Python -B Flag එක මඟින් Bytecode (.pyc) Cache කිරීම වළක්වයි
        const cmd = 'python -B ' + args.join(' ');
        console.log('🎬 Execution Command Node Pipeline:', cmd);
        
        if (req.app && req.app.locals && typeof req.app.locals.addToQueue === 'function') {
            req.app.locals.addToQueue({ themeName: '${cleanName}', command: cmd, tempFiles: tempFilesToPurge, manifestPath: '', outputName: uniqueOutputName, res: res });
        } else {
            res.status(500).json({ error: "Core Anti-Jam Queue framework missing." });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});
module.exports = router;`;

        // 4. JS File එක Disk එකට Write කිරීම
        fs.writeFileSync(fullJsPath, jsTemplateCode, 'utf8');

        // 5. RAM Cache Purge කිරීම
        try {
            const resolvedJsPath = path.resolve(fullJsPath).replace(/\\/g, '/');
            Object.keys(require.cache).forEach(key => {
                if (key.replace(/\\/g, '/').toLowerCase() === resolvedJsPath.toLowerCase()) {
                    delete require.cache[key];
                }
            });

            if (req.app && req.app.locals && typeof req.app.locals.registerDynamicRoute === 'function') {
                req.app.locals.registerDynamicRoute(fullJsPath);
            }
        } catch (cacheErr) {
            console.warn(`⚠️ Route hot-swapping warning:`, cacheErr.message);
        }

        res.json({ success: true, message: "Card specifications modified and Hot-Reloaded successfully!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/themes/:name', (req, res) => {
    try {
        const name = req.params.name;
        if (fs.existsSync(path.join(jsFolder, `${name}.js`))) fs.unlinkSync(path.join(jsFolder, `${name}.js`));
        if (fs.existsSync(path.join(trackersFolder, `${name}.py`))) fs.unlinkSync(path.join(trackersFolder, `${name}.py`));
        if (fs.existsSync(path.join(rootTemplatesDir, name))) fs.rmSync(path.join(rootTemplatesDir, name), { recursive: true, force: true });
        res.json({ success: true, message: "Deleted successfully." });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

function generateDynamicPythonString(bgKey, layers) {
    let capsDictionaryItems = "";
    layers.forEach((layer) => { 
        capsDictionaryItems += `        "${layer.field_key}": cv2.VideoCapture(os.path.join(templates_dir, '${layer.tracking_video_name}')),\n`; 
    });

    let imgsDictionaryItems = `        "${bgKey}": cv2.imread(sys.argv[1], cv2.IMREAD_UNCHANGED),\n`;
    layers.forEach((layer, idx) => { 
        imgsDictionaryItems += `        "${layer.field_key}": cv2.imread(sys.argv[${idx + 2}], cv2.IMREAD_UNCHANGED),\n`; 
    });

    let layerRenderingSequence = "[";
    layers.forEach((layer, idx) => { 
        layerRenderingSequence += `"${layer.field_key}"${idx < layers.length - 1 ? ', ' : ''}`; 
    });
    layerRenderingSequence += "]";

    return `import cv2
import numpy as np
import sys
import json
import os
import subprocess

def centroid(mask):
    pts = cv2.findNonZero(mask)
    if pts is None: return None
    return np.mean(pts.reshape(-1, 2).astype(np.float32), axis=0)

def get_corners_safe(hsv):
    try:
        red1 = cv2.inRange(hsv, np.array([0,150,50]), np.array([7,255,255]))
        red2 = cv2.inRange(hsv, np.array([175,150,50]), np.array([180,255,255]))
        tl = centroid(cv2.bitwise_or(red1, red2))
        tr = centroid(cv2.inRange(hsv, np.array([105,150,50]), np.array([130,255,255])))
        bl = centroid(cv2.inRange(hsv, np.array([8,150,50]), np.array([22,255,255])))
        br = centroid(cv2.inRange(hsv, np.array([140,120,50]), np.array([168,255,255])))
        if any(v is None for v in [tl, tr, bl, br]): return None
        return np.float32([tl, tr, br, bl])
    except: return None

def warp_rgba(img, dst, W, H):
    h, w = img.shape[:2]
    src = np.float32([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]])
    M = cv2.getPerspectiveTransform(src, dst)
    if img.shape[2] == 4:
        rgb = img[:, :, :3]
        alpha = img[:, :, 3]
    else:
        rgb = img
        alpha = np.ones((h, w), dtype=np.uint8) * 255
    warped_rgb = cv2.warpPerspective(rgb, M, (W, H))
    warped_alpha = cv2.warpPerspective(alpha, M, (W, H))
    return warped_rgb, warped_alpha

def alpha_blend(canvas, overlay_rgb, overlay_alpha):
    alpha = overlay_alpha.astype(np.float32) / 255.0
    alpha = np.dstack([alpha, alpha, alpha])
    canvas = canvas.astype(np.float32)
    overlay_rgb = overlay_rgb.astype(np.float32)
    out = overlay_rgb * alpha + canvas * (1 - alpha)
    return out.astype(np.uint8)

if __name__ == '__main__':
    templates_dir = sys.argv[-2]
    output_p = sys.argv[-1]

    caps = {
${capsDictionaryItems}    }
    imgs = {
${imgsDictionaryItems}    }
    
    if imgs["${bgKey}"] is None: sys.exit(1)
    
    rendering_order = ${layerRenderingSequence}
    first_layer_key = rendering_order[0] if len(rendering_order) > 0 else None
    
    # 🎯 FPS BUG FIX: ආරක්ෂිතව FPS කියවයි
    fps = int(caps[first_layer_key].get(cv2.CAP_PROP_FPS)) if first_layer_key and caps[first_layer_key].isOpened() else 0
    fps = fps if fps > 0 else 30
    
    W, H = 720, 720
    table = imgs["${bgKey}"]
    base_canvas = cv2.resize(cv2.cvtColor(table, cv2.COLOR_BGRA2BGR) if table.shape[2] == 4 else table.copy(), (W, H))
    
    ffmpeg_cmd = ["ffmpeg", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(fps), "-i", "-", "-vcodec", "libx264", "-preset", "superfast", "-crf", "26", "-b:v", "1000k", "-maxrate", "1200k", "-bufsize", "2000k", "-pix_fmt", "yuv420p", output_p]
    proc = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    
    while True:
        frames = {k: v.read() for k, v in caps.items()}
        if not all(f[0] for f in frames.values()): break
        
        canvas = base_canvas.copy()
        for layer in rendering_order:
            status, frame = frames[layer]
            if not status or frame is None: continue
            hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
            orig_dst = get_corners_safe(hsv)
            if orig_dst is None: continue
            template_h, template_w = frame.shape[:2]
            dst = orig_dst * np.array([W / template_w, H / template_h], dtype=np.float32)
            area = cv2.contourArea(dst)
            if area > (W * H * 0.95) or area < 100: continue
            img = imgs[layer]
            if img is None: continue
            warped_rgb, warped_alpha = warp_rgba(img, dst, W, H)
            _, warped_alpha = cv2.threshold(warped_alpha, 240, 255, cv2.THRESH_BINARY)
            canvas = alpha_blend(canvas, warped_rgb, warped_alpha)
            
        proc.stdin.write(canvas.tobytes())
        
    for c in caps.values(): c.release()
    
    # 🎯 48-BYTE DEADLOCK FIX: පරණ ප්‍රොජෙක්ට් එකේ මෙන් stderr buffer එක හිස් කරයි!
    proc.stdin.close()
    err = proc.stderr.read().decode()
    proc.wait()
    
    if proc.returncode != 0:
        print(json.dumps({"success": False, "error": err}))
    else:
        print(json.dumps({"success": True}))`;
}

module.exports = router;