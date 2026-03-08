const multer = require('multer');

const allowedTypes = /jpeg|jpg|png|gif|webp|bmp/;

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 10
  },
  fileFilter: (req, file, cb) => {
    const extname = allowedTypes.test(file.originalname.toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    }

    cb(new Error('只支持图片格式: jpeg, jpg, png, gif, webp, bmp'));
  }
});

const generateUploadFields = imageUpload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'images', maxCount: 10 }
]);

module.exports = {
  imageUpload,
  generateUploadFields
};
