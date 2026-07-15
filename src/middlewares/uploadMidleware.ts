import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import cloudinary from '../config/cloudinary.config';

// ─── Storage Buckets ──────────────────────────────────────────────────────────
// Each upload type goes into its own Cloudinary folder
// and has its own size/format restrictions.

function makeStorage(folder: string, allowedFormats: string[]) {
  return new CloudinaryStorage({
    cloudinary,
    params: async (_req, file) => ({
      folder,
      allowed_formats: allowedFormats,
      transformation: [{ quality: 'auto', fetch_format: 'auto' }],
    }),
  });
}

// ─── Logo upload (company profile) ───────────────────────────────────────────
export const uploadLogo = multer({
  storage: makeStorage('business-logos', ['jpg', 'jpeg', 'png', 'webp', 'svg']),
  limits: { fileSize: 2 * 1024 * 1024 },   // 2MB max
}).single('logo');                           // field name expected from FE

// ─── File upload (product) ─────────────────────────────────────────────────
export const uploadFile = multer({
  storage: makeStorage('product-files', ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'docx', 'xlsx', 'pptx', 'ppt']),
  limits: { fileSize: 5 * 1024 * 1024 },   // 5MB max
}).single('file');                           // field name expected from FE

// ─── Avatar upload (user profile) ────────────────────────────────────────────
export const uploadAvatar = multer({
  storage: makeStorage('user-avatars', ['jpg', 'jpeg', 'png', 'webp']),
  limits: { fileSize: 2 * 1024 * 1024 },   // 2MB max
}).single('avatar');
