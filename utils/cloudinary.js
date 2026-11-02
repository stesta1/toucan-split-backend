import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export function avatarPublicId(userId) {
  return `tarugoapp/avatars/${userId}`;
}

export function uploadAvatarBuffer(buffer, userId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        public_id: avatarPublicId(userId),
        overwrite: true,
        invalidate: true,
        resource_type: 'image',
        transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }],
      },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

export async function deleteAvatarUpload(userId) {
  await cloudinary.uploader.destroy(avatarPublicId(userId)).catch(() => {});
}

export default cloudinary;
