import fs from "node:fs";
import { HeadObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import * as Minio from "minio";
import { env } from "../../config/env.js";
import { HttpError } from "../../errors/httpError.js";

export type StorageBackend = "s3" | "minio";

export type FileMetadata = {
  size: number | undefined;
  created_at: Date | string | null | undefined;
  modified_at: Date | string | null | undefined;
  etag: string | undefined;
  content_type: string | undefined;
  storage_class: string | undefined | null;
};

export type StorageClient = {
  getSignedUrl: (
    filePath: string,
    options?: { expiration?: number; forceInline?: boolean }
  ) => Promise<string | null>;
  getFileMetadata: (filePath: string) => Promise<FileMetadata | null>;
  getPresignedPutUrl: (
    filePath: string,
    options?: { expiration?: number; contentType?: string; maxSize?: number }
  ) => Promise<string | null>;
  uploadFile: (
    localPath: string,
    filePath: string,
    options?: { contentType?: string }
  ) => Promise<boolean>;
};

const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

export const getCurrentStorageBackend = (): StorageBackend =>
  env.enableAwsS3 ? "s3" : "minio";

export const normalizeStorageBackend = (backend: string | null | undefined): StorageBackend => {
  if (!backend) {
    return getCurrentStorageBackend();
  }
  if (backend === "s3" || backend === "minio") {
    return backend;
  }
  throw new HttpError(400, `Unsupported storage backend: ${backend}`);
};

const contentHeadersForInlinePreview = (
  filePath: string,
  forceInline: boolean | undefined
) => {
  if (!forceInline) {
    return {};
  }
  if (filePath.endsWith(".txt")) {
    return {
      ResponseContentType: "text/plain",
      ResponseContentDisposition: "inline"
    };
  }
  if (filePath.endsWith(".wav")) {
    return {
      ResponseContentType: "audio/wav",
      ResponseContentDisposition: "inline"
    };
  }
  if (filePath.endsWith(".mp3")) {
    return {
      ResponseContentType: "audio/mpeg",
      ResponseContentDisposition: "inline"
    };
  }
  return {};
};

const publicMinioUrl = (filePath: string): string => {
  if (!env.minioPublicEndpoint) {
    throw new HttpError(500, "MINIO_PUBLIC_ENDPOINT is required for MinIO public URLs");
  }
  return `${stripTrailingSlash(env.minioPublicEndpoint)}/${env.minioBucket}/${filePath}`;
};

const minioClient = (): Minio.Client =>
  new Minio.Client({
    endPoint: env.minioEndpoint.split(":")[0],
    port: Number(env.minioEndpoint.split(":")[1] ?? (env.minioSecure ? 443 : 9000)),
    useSSL: env.minioSecure,
    accessKey: env.minioAccessKey,
    secretKey: env.minioSecretKey
  });

const createMinioStorage = (): StorageClient => ({
  getSignedUrl: async (filePath) => publicMinioUrl(filePath),

  getFileMetadata: async (filePath) => {
    try {
      const stat = await minioClient().statObject(env.minioBucket, filePath);
      return {
        size: stat.size,
        created_at: stat.lastModified,
        modified_at: stat.lastModified,
        etag: stat.etag,
        content_type: stat.metaData?.["content-type"],
        storage_class: null
      };
    } catch {
      return null;
    }
  },

  getPresignedPutUrl: async (filePath) => publicMinioUrl(filePath),

  uploadFile: async (localPath, filePath, options) => {
    try {
      await minioClient().fPutObject(env.minioBucket, filePath, localPath, {
        "Content-Type": options?.contentType ?? "application/octet-stream"
      });
      return true;
    } catch {
      return false;
    }
  }
});

const s3Client = (): S3Client =>
  new S3Client({
    region: env.s3Region
  });

const s3Bucket = (): string => {
  if (!env.s3Bucket) {
    throw new HttpError(500, "S3_BUCKET is required when using S3 storage");
  }
  return env.s3Bucket;
};

const createS3Storage = (): StorageClient => ({
  getSignedUrl: async (filePath, options) => {
    try {
      const command = new GetObjectCommand({
        Bucket: s3Bucket(),
        Key: filePath,
        ...contentHeadersForInlinePreview(filePath, options?.forceInline)
      });
      return await getSignedUrl(s3Client(), command, {
        expiresIn: options?.expiration ?? 3600
      });
    } catch {
      return null;
    }
  },

  getFileMetadata: async (filePath) => {
    try {
      const response = await s3Client().send(
        new HeadObjectCommand({
          Bucket: s3Bucket(),
          Key: filePath
        })
      );
      return {
        size: response.ContentLength,
        created_at: response.LastModified,
        modified_at: response.LastModified,
        etag: response.ETag?.replace(/^"|"$/g, ""),
        content_type: response.ContentType,
        storage_class: response.StorageClass
      };
    } catch {
      return null;
    }
  },

  getPresignedPutUrl: async (filePath, options) => {
    try {
      const command = new PutObjectCommand({
        Bucket: s3Bucket(),
        Key: filePath,
        ContentType: options?.contentType ?? "text/csv"
      });
      return await getSignedUrl(s3Client(), command, {
        expiresIn: options?.expiration ?? 900
      });
    } catch {
      return null;
    }
  },

  uploadFile: async (localPath, filePath, options) => {
    try {
      await s3Client().send(
        new PutObjectCommand({
          Bucket: s3Bucket(),
          Key: filePath,
          Body: fs.createReadStream(localPath),
          ContentType: options?.contentType ?? "application/octet-stream"
        })
      );
      return true;
    } catch {
      return false;
    }
  }
});

export const getStorageForBackend = (backend: string | null | undefined): StorageClient => {
  const normalized = normalizeStorageBackend(backend);
  return normalized === "s3" ? createS3Storage() : createMinioStorage();
};
