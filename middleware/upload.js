// middleware/upload.js
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() }); // file disimpan di buffer memori [web:471]
module.exports = { upload };
