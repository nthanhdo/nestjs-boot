import { Schema, Document } from 'mongoose';

export interface FileDocument extends Document {
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  path: string;
  url: string;
  folder: string;
  uploadedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export const FileSchema = new Schema(
  {
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },
    path: { type: String, required: true },
    url: { type: String, required: true },
    folder: { type: String, default: '' },
    uploadedBy: { type: String, default: '' },
  },
  { timestamps: true },
);

FileSchema.index({ folder: 1, createdAt: -1 });
FileSchema.index({ uploadedBy: 1 });

export const File = { name: 'File' };
