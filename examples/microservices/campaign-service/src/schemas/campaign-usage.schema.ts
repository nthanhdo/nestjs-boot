import { Schema, Document } from 'mongoose';

export interface CampaignUsageDocument extends Document {
  campaignId: string;
  userId: string;
  orderId: string;
  discountApplied: number;
  usedAt: Date;
}

export const CampaignUsageSchema = new Schema({
  campaignId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  orderId: { type: String, required: true },
  discountApplied: { type: Number, required: true, min: 0 },
  usedAt: { type: Date, default: Date.now },
});

CampaignUsageSchema.index({ campaignId: 1, userId: 1 });
CampaignUsageSchema.index({ orderId: 1 }, { unique: true });

export const CampaignUsage = { name: 'CampaignUsage' };
