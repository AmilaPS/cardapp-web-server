const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const bgParamName = 'table_img';
const trackingLayersConfig = [{"field_key":"inside_img","tracking_video_name":"tmpl_1784372868429_Inside.mp4"},{"field_key":"butterfly_img","tracking_video_name":"tmpl_1784372868430_Butterfly.mp4"},{"field_key":"frontback_img","tracking_video_name":"tmpl_1784372868431_Front_Back.mp4"},{"field_key":"front_img","tracking_video_name":"tmpl_1784372868432_Front_Cover.mp4"}];
const pythonEngineScript = 'birthday_card_01.py';

const uploadDir = path.join(process.cwd(), 'public', 'uploads');
const outputDir = path.join(process.cwd(), 'public', 'outputs');
const templateDir = path.join(process.cwd(), 'video_templates', 'birthday_card_01');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, 'run_' + Date.now() + '_' + file.originalname)
});
const upload = multer({ storage: storage });

router.post('/birthday_card_01', upload.any(), async (req, res) => {
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
        
        const uniqueOutputName = 'out_' + 'birthday_card_01_' + Date.now() + '.mp4';
        const outputPath = path.join(outputDir, uniqueOutputName);
        
        const pythonScriptPath = path.join(process.cwd(), 'trackers', pythonEngineScript);
        let args = ['"' + pythonScriptPath + '"'];
        uploadedImagesPaths.forEach(p => args.push('"' + p + '"'));
        args.push('"' + templateDir + '"');
        args.push('"' + outputPath + '"');
        
        const cmd = 'python ' + args.join(' ');
        console.log('🎬 Execution Command Node Pipeline:', cmd);
        
        if (req.app && req.app.locals && typeof req.app.locals.addToQueue === 'function') {
            req.app.locals.addToQueue({ themeName: 'birthday_card_01', command: cmd, tempFiles: tempFilesToPurge, manifestPath: '', outputName: uniqueOutputName, res: res });
        } else {
            res.status(500).json({ error: "Core Anti-Jam Queue framework missing." });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});
module.exports = router;