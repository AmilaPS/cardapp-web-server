const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const bgParamName = 'back_img';
const trackingLayersConfig = [{"field_key":"in_art_img","tracking_video_name":"tmpl_1784202388152_Inside_Artwork.mp4","order_index":0},{"field_key":"fl_ca_ba_img","tracking_video_name":"tmpl_1784202388153_Flip_Card_Back.mp4","order_index":1},{"field_key":"fl_ca_img","tracking_video_name":"tmpl_1784202388154_Flip_Card.mp4","order_index":2},{"field_key":"fr_pa_ba_img","tracking_video_name":"tmpl_1784202388154_Front_Page_Back.mp4","order_index":3},{"field_key":"fr_pa_img","tracking_video_name":"tmpl_1784202388155_Front_Page.mp4","order_index":4}];
const pythonEngineScript = 'christmas_card_gold.py';

const uploadDir = path.join(process.cwd(), 'public', 'uploads');
const outputDir = path.join(process.cwd(), 'public', 'outputs');
const templateDir = path.join(process.cwd(), 'video_templates', 'christmas_card_gold');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, 'run_' + Date.now() + '_' + file.originalname)
});
const upload = multer({ storage: storage });

router.post('/christmas_card_gold', upload.any(), async (req, res) => {
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
        
        const uniqueOutputName = 'out_' + 'christmas_card_gold_' + Date.now() + '.mp4';
        const outputPath = path.join(outputDir, uniqueOutputName);
        
        const pythonScriptPath = path.join(process.cwd(), 'trackers', pythonEngineScript);
        let args = ['"' + pythonScriptPath + '"'];
        uploadedImagesPaths.forEach(p => args.push('"' + p + '"'));
        args.push('"' + templateDir + '"');
        args.push('"' + outputPath + '"');
        
        const cmd = 'python ' + args.join(' ');
        console.log('🎬 Execution Command Node Pipeline:', cmd);
        
        if (req.app && req.app.locals && typeof req.app.locals.addToQueue === 'function') {
            req.app.locals.addToQueue({ themeName: 'christmas_card_gold', command: cmd, tempFiles: tempFilesToPurge, manifestPath: '', outputName: uniqueOutputName, res: res });
        } else {
            res.status(500).json({ error: "Core Anti-Jam Queue framework missing." });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});
module.exports = router;