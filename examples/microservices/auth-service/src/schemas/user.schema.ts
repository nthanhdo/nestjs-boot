import { Schema, Document } from 'mongoose';

export interface UserDocument extends Document {
  email: string;
  passwordHash: string;
  name: string;
  roles: string[];
  refreshToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    roles: { type: [String], default: ['user'] },
    refreshToken: { type: String, default: null },
  },
  { timestamps: true },
);

UserSchema.index({ email: 1 });

export const User = { name: 'User' };
