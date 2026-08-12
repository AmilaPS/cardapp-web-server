import cv2
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
        "right_img": cv2.VideoCapture(os.path.join(templates_dir, 'tmpl_1786304718057_right.mp4')),
        "middle_img": cv2.VideoCapture(os.path.join(templates_dir, 'tmpl_1786304718057_middle.mp4')),
        "left_img": cv2.VideoCapture(os.path.join(templates_dir, 'tmpl_1786304718059_left.mp4')),
        "heart_text_img": cv2.VideoCapture(os.path.join(templates_dir, 'tmpl_1786304718059_heart_text.mp4')),
        "heart_image_img": cv2.VideoCapture(os.path.join(templates_dir, 'tmpl_1786304718060_heart_image.mp4')),
    }
    imgs = {
        "table_img": cv2.imread(sys.argv[1], cv2.IMREAD_UNCHANGED),
        "right_img": cv2.imread(sys.argv[2], cv2.IMREAD_UNCHANGED),
        "middle_img": cv2.imread(sys.argv[3], cv2.IMREAD_UNCHANGED),
        "left_img": cv2.imread(sys.argv[4], cv2.IMREAD_UNCHANGED),
        "heart_text_img": cv2.imread(sys.argv[5], cv2.IMREAD_UNCHANGED),
        "heart_image_img": cv2.imread(sys.argv[6], cv2.IMREAD_UNCHANGED),
    }
    
    if imgs["table_img"] is None: sys.exit(1)
    
    rendering_order = ["right_img", "middle_img", "left_img", "heart_text_img", "heart_image_img"]
    first_layer_key = rendering_order[0] if len(rendering_order) > 0 else None
    
    fps = int(caps[first_layer_key].get(cv2.CAP_PROP_FPS)) if first_layer_key and caps[first_layer_key].isOpened() else 0
    fps = fps if fps > 0 else 30
    
    W, H = 720, 720
    table = imgs["table_img"]
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
        print(json.dumps({"success": True}))