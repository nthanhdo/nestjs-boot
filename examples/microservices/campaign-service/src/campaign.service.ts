import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventBusService } from 'nestjs-boot';
import { CampaignDocument } from './schemas/campaign.schema';
import { CampaignUsageDocument } from './schemas/campaign-usage.schema';
import {
  CampaignActivatedEvent,
  CampaignDeactivatedEvent,
  CampaignAppliedEvent,
} from './events/campaign.events';

/**
 * CampaignService demonstrates nestjs-boot's CacheModule (promo code lookup),
 * EventBus (campaign lifecycle events), and Database (CRUD + usage tracking).
 */
@Injectable()
export class CampaignService {
  private readonly logger = new Logger(CampaignService.name);

  constructor(
    @InjectModel('Campaign')
    private readonly campaignModel: Model<CampaignDocument>,
    @InjectModel('CampaignUsage')
    private readonly usageModel: Model<CampaignUsageDocument>,
    @Inject('CACHE_SERVICE')
    private readonly cache: {
      get<T>(key: string): Promise<T | null>;
      set(key: string, value: unknown, ttl?: number): Promise<void>;
      del(key: string): Promise<void>;
    },
    private readonly eventBus: EventBusService,
  ) {}

  async create(data: {
    name: string;
    description?: string;
    type: string;
    promoCode?: string;
    discount: { type: string; value: number; maxDiscount?: number };
    startDate: string;
    endDate: string;
    usageLimit?: number;
    minOrderAmount?: number;
    targetProducts?: string[];
    targetCategories?: string[];
  }): Promise<CampaignDocument> {
    const campaign = new this.campaignModel({
      ...data,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      status: 'draft',
      usageCount: 0,
    });
    const saved = await campaign.save();
    this.logger.log(`Campaign created: ${saved._id} "${saved.name}"`);
    return saved;
  }

  async findOne(id: string): Promise<CampaignDocument> {
    const cacheKey = `campaign:${id}`;
    const cached = await this.cache.get<CampaignDocument>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache HIT for ${cacheKey}`);
      return cached;
    }

    const campaign = await this.campaignModel.findById(id).exec();
    if (!campaign) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    await this.cache.set(cacheKey, campaign.toObject(), 300);
    return campaign;
  }

  async findAll(
    status?: string,
    type?: string,
    page = 1,
    limit = 20,
  ): Promise<{ items: CampaignDocument[]; total: number }> {
    const filter: Record<string, string> = {};
    if (status) filter.status = status;
    if (type) filter.type = type;
    const skip = (Math.max(page, 1) - 1) * limit;

    const [items, total] = await Promise.all([
      this.campaignModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Math.min(limit, 100))
        .exec(),
      this.campaignModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      discount?: { type: string; value: number; maxDiscount?: number };
      endDate?: string;
      usageLimit?: number;
      minOrderAmount?: number;
    },
  ): Promise<CampaignDocument> {
    const updateData: Record<string, unknown> = { ...data };
    if (data.endDate) updateData.endDate = new Date(data.endDate);

    const campaign = await this.campaignModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .exec();
    if (!campaign) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    await this.cache.del(`campaign:${id}`);
    if (campaign.promoCode) {
      await this.cache.del(`promo:${campaign.promoCode}`);
    }

    this.logger.log(`Campaign updated: ${id}`);
    return campaign;
  }

  async delete(id: string): Promise<boolean> {
    const campaign = await this.campaignModel.findById(id).exec();
    if (!campaign) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    await this.campaignModel.deleteOne({ _id: id }).exec();
    await this.cache.del(`campaign:${id}`);
    if (campaign.promoCode) {
      await this.cache.del(`promo:${campaign.promoCode}`);
    }

    this.logger.log(`Campaign deleted: ${id}`);
    return true;
  }

  async activate(id: string): Promise<CampaignDocument> {
    const campaign = await this.campaignModel.findById(id).exec();
    if (!campaign) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    const now = new Date();
    if (campaign.endDate < now) {
      throw new Error('Cannot activate a campaign that has already ended');
    }
    if (campaign.startDate > now) {
      throw new Error('Cannot activate a campaign before its start date');
    }

    campaign.status = 'active';
    const saved = await campaign.save();

    await this.cache.del(`campaign:${id}`);

    await this.eventBus.emit(
      new CampaignActivatedEvent(id, saved.name, saved.promoCode),
    );
    this.logger.log(`Campaign activated: ${id} "${saved.name}"`);

    return saved;
  }

  async deactivate(id: string): Promise<CampaignDocument> {
    const campaign = await this.campaignModel.findById(id).exec();
    if (!campaign) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    campaign.status = 'paused';
    const saved = await campaign.save();

    await this.cache.del(`campaign:${id}`);
    if (saved.promoCode) {
      await this.cache.del(`promo:${saved.promoCode}`);
    }

    await this.eventBus.emit(
      new CampaignDeactivatedEvent(id, saved.name, 'manual'),
    );
    this.logger.log(`Campaign deactivated: ${id} "${saved.name}"`);

    return saved;
  }

  async validatePromoCode(
    promoCode: string,
    orderAmount: number,
    productIds: string[],
  ): Promise<{
    valid: boolean;
    message: string;
    discount?: { type: string; value: number; maxDiscount?: number };
    discountAmount?: number;
  }> {
    // Check cache first for promo code lookup
    const cacheKey = `promo:${promoCode}`;
    let campaign = await this.cache.get<CampaignDocument>(cacheKey);

    if (!campaign) {
      const found = await this.campaignModel
        .findOne({ promoCode })
        .exec();
      if (!found) {
        return { valid: false, message: 'Promo code not found' };
      }
      campaign = found.toObject() as CampaignDocument;
      await this.cache.set(cacheKey, campaign, 120);
    }

    // Check status
    if (campaign.status !== 'active') {
      return { valid: false, message: 'Promo code is not currently active' };
    }

    // Check dates
    const now = new Date();
    if (new Date(campaign.startDate) > now) {
      return { valid: false, message: 'Promo code is not yet valid' };
    }
    if (new Date(campaign.endDate) < now) {
      return { valid: false, message: 'Promo code has expired' };
    }

    // Check usage limit
    if (campaign.usageLimit > 0 && campaign.usageCount >= campaign.usageLimit) {
      return {
        valid: false,
        message: 'Promo code has reached its usage limit',
      };
    }

    // Check minimum order amount
    if (campaign.minOrderAmount > 0 && orderAmount < campaign.minOrderAmount) {
      return {
        valid: false,
        message: `Minimum order amount is $${campaign.minOrderAmount.toFixed(2)}`,
      };
    }

    // Check target products
    if (
      campaign.targetProducts &&
      campaign.targetProducts.length > 0 &&
      productIds.length > 0
    ) {
      const hasMatch = productIds.some((pid) =>
        campaign!.targetProducts.includes(pid),
      );
      if (!hasMatch) {
        return {
          valid: false,
          message: 'Promo code is not valid for these products',
        };
      }
    }

    // Check target categories (if productIds provided, we check overlap)
    // In a real system, you'd resolve productIds to categories via product service

    // Calculate discount
    const discountAmount = this.calculateDiscount(
      campaign.discount,
      orderAmount,
    );

    return {
      valid: true,
      message: 'Promo code is valid',
      discount: campaign.discount,
      discountAmount,
    };
  }

  async applyPromoCode(
    promoCode: string,
    orderId: string,
    userId: string,
    orderAmount: number,
  ): Promise<{ success: boolean; discountApplied: number; message: string }> {
    // Validate first
    const validation = await this.validatePromoCode(promoCode, orderAmount, []);
    if (!validation.valid) {
      return {
        success: false,
        discountApplied: 0,
        message: validation.message,
      };
    }

    // Check if this order already used a promo
    const existingUsage = await this.usageModel
      .findOne({ orderId })
      .exec();
    if (existingUsage) {
      return {
        success: false,
        discountApplied: 0,
        message: 'A promo code has already been applied to this order',
      };
    }

    const campaign = await this.campaignModel
      .findOne({ promoCode })
      .exec();
    if (!campaign) {
      return {
        success: false,
        discountApplied: 0,
        message: 'Campaign not found',
      };
    }

    const discountApplied = this.calculateDiscount(
      campaign.discount,
      orderAmount,
    );

    // Increment usage count atomically
    await this.campaignModel.updateOne(
      { _id: campaign._id },
      { $inc: { usageCount: 1 } },
    );

    // Record usage
    await this.usageModel.create({
      campaignId: campaign._id!.toString(),
      userId,
      orderId,
      discountApplied,
    });

    // Invalidate caches
    await this.cache.del(`campaign:${campaign._id}`);
    await this.cache.del(`promo:${promoCode}`);

    // Emit event
    await this.eventBus.emit(
      new CampaignAppliedEvent(
        campaign._id!.toString(),
        orderId,
        userId,
        discountApplied,
      ),
    );

    this.logger.log(
      `Promo "${promoCode}" applied to order ${orderId} — discount $${discountApplied.toFixed(2)}`,
    );

    return {
      success: true,
      discountApplied,
      message: `Discount of $${discountApplied.toFixed(2)} applied`,
    };
  }

  async getStats(id: string): Promise<{
    campaignId: string;
    totalUses: number;
    totalDiscountGiven: number;
    uniqueUsers: number;
    conversionRate: number;
  }> {
    const campaign = await this.campaignModel.findById(id).exec();
    if (!campaign) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    const usages = await this.usageModel.find({ campaignId: id }).exec();
    const uniqueUserSet = new Set(usages.map((u) => u.userId));
    const totalDiscountGiven = usages.reduce(
      (sum, u) => sum + u.discountApplied,
      0,
    );

    const conversionRate =
      campaign.usageLimit > 0
        ? (campaign.usageCount / campaign.usageLimit) * 100
        : 0;

    return {
      campaignId: id,
      totalUses: campaign.usageCount,
      totalDiscountGiven,
      uniqueUsers: uniqueUserSet.size,
      conversionRate: Math.round(conversionRate * 100) / 100,
    };
  }

  private calculateDiscount(
    discount: { type: string; value: number; maxDiscount?: number },
    orderAmount: number,
  ): number {
    let amount = 0;

    if (discount.type === 'percentage') {
      amount = orderAmount * (discount.value / 100);
      if (discount.maxDiscount) {
        amount = Math.min(amount, discount.maxDiscount);
      }
    } else if (discount.type === 'fixed_amount') {
      amount = discount.value;
    }

    // Never discount more than the order total
    return Math.min(amount, orderAmount);
  }

  private toCampaignResponse(campaign: CampaignDocument) {
    return {
      id: campaign._id?.toString(),
      name: campaign.name,
      description: campaign.description,
      type: campaign.type,
      status: campaign.status,
      promoCode: campaign.promoCode || '',
      discount: campaign.discount
        ? {
            type: campaign.discount.type,
            value: campaign.discount.value,
            maxDiscount: campaign.discount.maxDiscount || 0,
          }
        : undefined,
      startDate: campaign.startDate?.toISOString() || '',
      endDate: campaign.endDate?.toISOString() || '',
      usageLimit: campaign.usageLimit,
      usageCount: campaign.usageCount,
      minOrderAmount: campaign.minOrderAmount,
      targetProducts: campaign.targetProducts || [],
      targetCategories: campaign.targetCategories || [],
      createdAt: campaign.createdAt?.toISOString() || '',
    };
  }
}
