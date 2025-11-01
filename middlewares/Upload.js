const multer = require('multer');
const fs = require('fs');
const path = require('path');

const uploadRoot = path.join(__dirname, '..', 'uploads');
const resourceDir = path.join(uploadRoot, 'resources');

// Ensure directories exist
function ensureDirs() {
  if (!fs.existsSync(uploadRoot)) fs.mkdirSync(uploadRoot);
  if (!fs.existsSync(resourceDir)) fs.mkdirSync(resourceDir);
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    ensureDirs();
    cb(null, resourceDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-z0-9-_]/gi, '_');
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${base}-${unique}${ext}`);
  },
});

function imageFileFilter(req, file, cb) {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new Error('Only image files are allowed'));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

module.exports = {
  upload,
  resourceUploadsPath: '/uploads/resources',
  resourceDir,
};