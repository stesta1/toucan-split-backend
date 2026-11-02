import multer from 'multer';

const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new Error('El archivo debe ser una imagen'));
  }
  cb(null, true);
}

const avatarUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
}).single('avatar');

export function uploadAvatarMiddleware(req, res, next) {
  avatarUpload(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'No se pudo procesar la imagen' });
    if (!req.file) return res.status(400).json({ error: 'No se envió ninguna imagen' });
    next();
  });
}
