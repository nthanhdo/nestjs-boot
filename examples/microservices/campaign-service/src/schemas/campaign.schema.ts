import { Schema, Document } from 'mongoose';

export interface CampaignDocument extends Document {
  name: string;
  description: string;
  type: 'percentage' | 'fixed_amount' | 'free_shipping' | 'buy_x_get_y';
  status: 'draft' | 'active' | 'paused' | 'ended' | 'expired';
  promoCode: string;
  discount: {
    type: 'percentage' | 'fixed_amount';
    value: number;
    maxDiscount?: number;
  };
  startDate: Date;
  endDate: Date;
  usageLimit: number;
  usageCount: number;
  minOrderAmount: number;
  targetProducts: string[];
  targetCategories: string[];
  createdAt: Date;
  updatedAt: Date;
}

export const CampaignSchema = new Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: '' },
    type: {
      type: String,
      required: true,
      enum: ['percentage', 'fixed_amount', 'free_shipping', 'buy_x_get_y'],
    },
    status: {
      type: String,
      required: true,
      enum: ['draft', 'active', 'paused', 'ended', 'expired'],
      default: 'draft',
    },
    promoCode: { type: String, sparse: true },
    discount: {
      type: {
        type: String,
        enum: ['percentage', 'fixed_amount'],
        required: true,
      },
      value: { type: Number, required: true, min: 0 },
      maxDiscount: { type: Number, min: 0 },
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    usageLimit: { type: Number, default: 0 },
    usageCount: { type: Number, default: 0 },
    minOrderAmount: { type: Number, default: 0, min: 0 },
    targetProducts: [{ type: String }],
    targetCategories: [{ type: String }],
  },
  { timestamps: true },
);

CampaignSchema.index({ promoCode: 1 }, { unique: true, sparse: true });
CampaignSchema.index({ status: 1, type: 1 });
CampaignSchema.index({ endDate: 1, status: 1 });

export const Campaign = { name: 'Campaign' };
