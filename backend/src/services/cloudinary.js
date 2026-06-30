import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

const REQUIRED_CLOUDINARY_VARS = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
];

const isCloudinaryConfigured = () =>
  REQUIRED_CLOUDINARY_VARS.every((key) => Boolean(process.env[key]));

const configureCloudinary = () => {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
};

const getMissingCloudinaryVars = () =>
  REQUIRED_CLOUDINARY_VARS.filter((key) => !process.env[key]);

const normalizeCloudinaryPath = (value) =>
  String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/');

const resolveUploadFolder = (folder) => {
  const root = normalizeCloudinaryPath(process.env.CLOUDINARY_UPLOAD_ROOT || '10th-west-moto');
  const normalizedFolder = normalizeCloudinaryPath(folder || 'misc');
  return [root, normalizedFolder].filter(Boolean).join('/');
};

export const assertCloudinaryConfigured = () => {
  const missing = getMissingCloudinaryVars();
  if (missing.length > 0) {
    const error = new Error(`Cloudinary configuration is missing: ${missing.join(', ')}`);
    error.code = 'CLOUDINARY_CONFIG_MISSING';
    throw error;
  }

  configureCloudinary();
};

export const uploadBufferToCloudinary = async ({
  buffer,
  contentType,
  folder,
  publicId,
  resourceType = 'image',
}) => {
  assertCloudinaryConfigured();

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('uploadBufferToCloudinary requires a non-empty buffer');
  }

  const resolvedFolder = resolveUploadFolder(folder);

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: resolvedFolder,
        resource_type: resourceType,
        public_id: publicId,
        overwrite: false,
        invalidate: false,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        const secureUrl = result?.secure_url || result?.url;
        if (!secureUrl) {
          reject(new Error('Cloudinary upload succeeded but no public URL was returned.'));
          return;
        }

        resolve({
          url: secureUrl,
          bytes: result?.bytes,
          format: result?.format,
          resourceType: result?.resource_type,
          contentType,
        });
      }
    );

    Readable.from(buffer).pipe(uploadStream);
  });
};

export { isCloudinaryConfigured, getMissingCloudinaryVars };
