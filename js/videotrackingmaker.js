const express = require('express');
const router = express.Router(); // Fixed require assignment line mapping
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const rootTemplatesDir = path.join(process.cwd(), 'video_templates');
const jsFolder = path.join(process.cwd(), 'js');
const trackersFolder = path.join(process.cwd(), 'trackers');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const cleanName = req.body.theme_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const targetFolder = path.join(rootTemplatesDir, cleanName);
        if (!fs.existsSync(targetFolder)) fs.mkdirSync(targetFolder, { recursive: true });
        cb(null, targetFolder);
    },
    filename: (req, file, cb) => {
        cb(null, `tmpl_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`);
    }
});
const upload = multer({ storage: storage });

router.post('/api/themes/save', upload.any(), async (req, res) => {
    try {
        const rawName = req.body.theme_name;
        const cleanName = rawName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const customApiUrl = req.body.api_url.trim();
        
        const baseBgKey = req.body.bg_key.trim();
        const bgKey = baseBgKey.endsWith('_img') ? baseBgKey : `${baseBgKey}_img`;
        
        const parsedLayers = JSON.parse(req.body.layers_metadata);

        const pyFilename = `${cleanName}.py`;
        const jsFilename = `${cleanName}.js`;
        const fullJsPath = path.join(jsFolder, jsFilename);

        if (fs.existsSync(fullJsPath)) {
            req.files.forEach(f => { if(fs.existsSync(f.path)) fs.unlinkSync(f.path); });
            return res.status(400).json({ success: false, error: `Duplicate Error: '${rawName}' දැනටමත් ඇත!` });
        }

        const finalLayers = parsedLayers.map((layer, index) => {
            const foundFile = req.files.find(f => f.fieldname === `video_layer_${index}`);
            const baseKey = layer.field_key.trim();
            const finalKey = baseKey.endsWith('_img') ? baseKey : `${baseKey}_img`;
            
            return { 
                field_key: finalKey, 
                tracking_video_name: foundFile ? foundFile.filename : '',
                order_index: layer.order_index 
            };
        });

        // 1. Generate Absolute Native Deadlock-Free Python Script File
        fs.writeFileSync(path.join(trackersFolder, pyFilename), generateDynamicPythonString(bgKey, finalLayers), 'utf8');

        // 2. Generate Distinct Order-Aware Strict Image-Sorting JSRouter
        fs.writeFileSync(fullJsPath, generateJSRouterString(cleanName, customApiUrl, bgKey, finalLayers, pyFilename), 'utf8');
        
        req.app.locals.registerDynamicRoute(fullJsPath);
        
        res.json({ success: true, message: "Distinct JS සහ Tracker PY ෆයිල් සාර්ථකව සාදන ලදී!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========================================================================
// ⚡ CORE PYTHON GENERATOR - FIXED FOR STACK ALIGNMENT & PIPE DEADLOCKS
// ========================================================================
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
    
    # 🎯 48-BYTE DEADLOCK FIX: Clears OS buffer logs instantly to avoid render freezes
    proc.stdin.close()
    err = proc.stderr.read().decode()
    proc.wait()
    
    if proc.returncode != 0:
        print(json.dumps({"success": False, "error": err}))
    else:
        print(json.dumps({"success": True}))`;
}

// ========================================================================
// ⚡ DISTINCT JS API ROUTER COMPILER - EMBEDS STABLE FOR...OF SORTING LOOPS
// ========================================================================
function generateJSRouterString(cleanName, customApiUrl, bgKey, layers, pyFilename) {
    return `const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const bgParamName = '${bgKey}';
const trackingLayersConfig = ${JSON.stringify(layers)};
const pythonEngineScript = '${pyFilename}';

const uploadDir = path.join(process.cwd(), 'public', 'uploads');
const outputDir = path.join(process.cwd(), 'public', 'outputs');
const templateDir = path.join(process.cwd(), 'video_templates', '${cleanName}');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, 'run_' + Date.now() + '_' + file.originalname)
});
const upload = multer({ storage: storage });

router.post('${customApiUrl.replace('/api', '')}', upload.any(), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) return res.status(400).json({ error: "No files uploaded." });

        const bgFile = req.files.find(f => f.fieldname === bgParamName);
        if (!bgFile) return res.status(400).json({ error: 'Background asset missing' });
        
        let uploadedImagesPaths = [];
        let tempFilesToPurge = [bgFile.path];
        
        // Push background source location first
        uploadedImagesPaths.push(bgFile.path);
        
        // 🎯 STABLE FOR...OF LOOP: Enforces strict user stacking sequence maps securely
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
            console.error("❌ Node Pipeline Blocked! Missing slot name:", missingField);
            return res.status(400).json({ success: false, error: "Missing required image slot: " + missingField });
        }
        
        const uniqueOutputName = 'out_' + '${cleanName}_' + Date.now() + '.mp4';
        const outputPath = path.join(outputDir, uniqueOutputName);
        
        const pythonScriptPath = path.join(process.cwd(), 'trackers', pythonEngineScript);
        let args = ['"' + pythonScriptPath + '"'];
        uploadedImagesPaths.forEach(p => args.push('"' + p + '"'));
        args.push('"' + templateDir + '"');
        args.push('"' + outputPath + '"');
        
        const cmd = 'python ' + args.join(' ');
        console.log('🎬 Execution Command Node Pipeline:', cmd);
        
        if (req.app && req.app.locals && typeof req.app.locals.addToQueue === 'function') {
            req.app.locals.addToQueue({ themeName: '${cleanName}', command: cmd, tempFiles: tempFilesToPurge, manifestPath: '', outputName: uniqueOutputName, res: res });
        } else {
            res.status(500).json({ error: "Core Anti-Jam Queue framework missing." });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});
module.exports = router;`;
}

module.exports = router;