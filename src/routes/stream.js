/**
 * Video Stream Proxy - Backend endpoint untuk relay video dari CV ke dashboard
 * 
 * Flow:
 * 1. CV program upload frame via POST /api/stream/upload
 * 2. Backend simpan frame di memory
 * 3. Dashboard akses stream via GET /api/stream/video
 */

const express = require('express');
const router = express.Router();

// Store latest frame in memory
let latestFrame = null;
let frameTimestamp = null;
const FRAME_TIMEOUT = 5000; // 5 seconds

/**
 * POST /api/stream/upload
 * CV program upload frame (base64 JPEG)
 */
router.post('/upload', express.json({ limit: '5mb' }), (req, res) => {
  try {
    const { frame } = req.body; // base64 encoded JPEG
    
    if (!frame) {
      return res.status(400).json({ message: 'Frame is required' });
    }
    
    // Store frame
    latestFrame = Buffer.from(frame, 'base64');
    frameTimestamp = Date.now();
    
    res.json({ success: true, timestamp: frameTimestamp });
  } catch (err) {
    console.error('Frame upload error:', err);
    res.status(500).json({ message: 'Failed to upload frame' });
  }
});

/**
 * GET /api/stream/video
 * Dashboard akses MJPEG stream
 */
router.get('/video', (req, res) => {
  res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=frame');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const sendFrame = () => {
    if (!latestFrame || (Date.now() - frameTimestamp > FRAME_TIMEOUT)) {
      // No frame or frame too old - send placeholder
      const placeholder = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
      res.write(`--frame\r\nContent-Type: image/jpeg\r\n\r\n`);
      res.write(placeholder);
      res.write('\r\n');
    } else {
      // Send latest frame
      res.write(`--frame\r\nContent-Type: image/jpeg\r\n\r\n`);
      res.write(latestFrame);
      res.write('\r\n');
    }
  };
  
  // Send frame every 100ms (~10 FPS to reduce bandwidth)
  const interval = setInterval(sendFrame, 100);
  
  req.on('close', () => {
    clearInterval(interval);
  });
});

/**
 * GET /api/stream/status
 * Check stream status
 */
router.get('/status', (req, res) => {
  const isActive = latestFrame && (Date.now() - frameTimestamp < FRAME_TIMEOUT);
  res.json({
    active: isActive,
    lastUpdate: frameTimestamp ? new Date(frameTimestamp).toISOString() : null,
    age: frameTimestamp ? Date.now() - frameTimestamp : null
  });
});

module.exports = router;
