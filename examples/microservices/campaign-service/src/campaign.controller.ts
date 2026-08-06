import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { CampaignService } from './campaign.service';
import { CampaignDocument } from './schemas/campaign.schema';

interface CreateCampaignRequest {
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
}

interface UpdateCampaignRequest {
  id: string;
  name?: string;
  description?: string;
  discount?: { type: string; value: number; maxDiscount?: number };
  endDate?: string;
  usageLimit?: number;
  minOrderAmount?: number;
}

interface CampaignById {
  id: string;
}

interface ListCampaignsRequest {
  status?: string;
  type?: string;
  page?: number;
  limit?: number;
}

interface ValidatePromoRequest {
  promoCode: string;
  orderAmount: number;
  productIds?: string[];
}

interface ApplyPromoRequest {
  promoCode: string;
  orderId: string;
  userId: string;
  orderAmount: number;
}

@Controller()
export class CampaignController {
  constructor(private readonly campaignService: CampaignService) {}

  @GrpcMethod('CampaignService', 'CreateCampaign')
  async createCampaign(data: CreateCampaignRequest) {
    const campaign = await this.campaignService.create(data);
    return this.toCampaignResponse(campaign);
  }

  @GrpcMethod('CampaignService', 'GetCampaign')
  async getCampaign(data: CampaignById) {
    const campaign = await this.campaignService.findOne(data.id);
    return this.toCampaignResponse(campaign);
  }

  @GrpcMethod('CampaignService', 'ListCampaigns')
  async listCampaigns(data: ListCampaignsRequest) {
    const result = await this.campaignService.findAll(
      data.status,
      data.type,
      data.page,
      data.limit,
    );
    return {
      items: result.items.map((c) => this.toCampaignResponse(c)),
      total: result.total,
    };
  }

  @GrpcMethod('CampaignService', 'UpdateCampaign')
  async updateCampaign(data: UpdateCampaignRequest) {
    const { id, ...updateData } = data;
    const campaign = await this.campaignService.update(id, updateData);
    return this.toCampaignResponse(campaign);
  }

  @GrpcMethod('CampaignService', 'DeleteCampaign')
  async deleteCampaign(data: CampaignById) {
    const success = await this.campaignService.delete(data.id);
    return { success };
  }

  @GrpcMethod('CampaignService', 'ActivateCampaign')
  async activateCampaign(data: CampaignById) {
    const campaign = await this.campaignService.activate(data.id);
    return this.toCampaignResponse(campaign);
  }

  @GrpcMethod('CampaignService', 'DeactivateCampaign')
  async deactivateCampaign(data: CampaignById) {
    const campaign = await this.campaignService.deactivate(data.id);
    return this.toCampaignResponse(campaign);
  }

  @GrpcMethod('CampaignService', 'ValidatePromoCode')
  async validatePromoCode(data: ValidatePromoRequest) {
    const result = await this.campaignService.validatePromoCode(
      data.promoCode,
      data.orderAmount,
      data.productIds || [],
    );
    return {
      valid: result.valid,
      message: result.message,
      discount: result.discount || { type: '', value: 0, maxDiscount: 0 },
      discountAmount: result.discountAmount || 0,
    };
  }

  @GrpcMethod('CampaignService', 'ApplyPromoCode')
  async applyPromoCode(data: ApplyPromoRequest) {
    return this.campaignService.applyPromoCode(
      data.promoCode,
      data.orderId,
      data.userId,
      data.orderAmount,
    );
  }

  @GrpcMethod('CampaignService', 'GetCampaignStats')
  async getCampaignStats(data: CampaignById) {
    return this.campaignService.getStats(data.id);
  }

  private toCampaignResponse(campaign: CampaignDocument) {
    return {
      id: campaign._id?.toString(),
      name: campaign.name,
      description: campaign.description || '',
      type: campaign.type,
      status: campaign.status,
      promoCode: campaign.promoCode || '',
      discount: campaign.discount
        ? {
            type: campaign.discount.type,
            value: campaign.discount.value,
            maxDiscount: campaign.discount.maxDiscount || 0,
          }
        : { type: '', value: 0, maxDiscount: 0 },
      startDate: campaign.startDate?.toISOString() || '',
      endDate: campaign.endDate?.toISOString() || '',
      usageLimit: campaign.usageLimit || 0,
      usageCount: campaign.usageCount || 0,
      minOrderAmount: campaign.minOrderAmount || 0,
      targetProducts: campaign.targetProducts || [],
      targetCategories: campaign.targetCategories || [],
      createdAt: campaign.createdAt?.toISOString() || '',
    };
  }
}
