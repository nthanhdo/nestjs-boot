import { Schema, Document } from 'mongoose';

export interface JobDocument extends Document {
  name: string;
  cron: string;
  handler: string;
  payload: string;
  enabled: boolean;
  status: 'active' | 'paused' | 'failed';
  lastRun: Date | null;
  nextRun: Date | null;
  runCount: number;
  failCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export const JobSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    cron: { type: String, required: true },
    handler: { type: String, required: true },
    payload: { type: String, default: '{}' },
    enabled: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ['active', 'paused', 'failed'],
      default: 'active',
    },
    lastRun: { type: Date, default: null },
    nextRun: { type: Date, default: null },
    runCount: { type: Number, default: 0 },
    failCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

JobSchema.index({ status: 1, handler: 1 });
JobSchema.index({ nextRun: 1 });

export const Job = { name: 'Job' };
