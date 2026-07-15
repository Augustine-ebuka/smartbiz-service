import { v2 as cloudinary } from 'cloudinary';

const requiredEnvVars = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
];

// Validate required Cloudinary config on module load
requiredEnvVars.forEach((varName) => {
  if (!process.env[varName]) {
    console.error(`⚠️ Missing required environment variable: ${varName}`);
  }
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export default cloudinary;