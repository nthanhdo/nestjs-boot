import { Schema, Document } from 'mongoose';

export interface NotificationDocument extends Document {
  userId: string;
  message: string;
  type: 'order' | 'system' | 'promotion';
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const NotificationSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    message: { type: String, required: true },
    type: {
      type: String,
      enum: ['order', 'system', 'promotion'],
      default: 'system',
    },
    read: { type: Boolean, default: false },
  },
  { timestamps: true },
);

NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export const Notification = { name: 'Notification' };
