// libs/cloudinary-helpers.ts
const { Readable } = require("stream");
const { cloudinary } = require("./cloudinary");

// Stream upload dari Buffer ke Cloudinary
function uploadBufferToCloudinary(buffer, folder, filename) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `jenggawah`,
        public_id: filename,
        resource_type: "image",
      },
      (err, result) => {
        if (err || !result) return reject(err);
        resolve({
          image_url: result.secure_url,
          public_id: result.public_id,
        });
      }
    );
    const readable = new Readable({
      read() {
        this.push(buffer);
        this.push(null);
      },
    });
    readable.pipe(uploadStream);
  });
} // [web:463][web:466]

async function deleteCloudinaryByPublicId(publicId) {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
  } catch (e) {
    // log saja, jangan gagalkan seluruh transaksi
    console.warn("Cloudinary destroy failed:", e);
  }
} // [web:472][web:479]

module.exports = {
  uploadBufferToCloudinary,
  deleteCloudinaryByPublicId,
};
