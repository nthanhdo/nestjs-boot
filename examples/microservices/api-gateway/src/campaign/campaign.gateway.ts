import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Observable } from 'rxjs';

interface Campaign {
  id: string;
  name: string;
  description: string;
  type: string;
  status: string;
  promoCode: string;
  discount: { type: string; value: number; maxDiscount: number };
  startDate: string;
  endDate: string;
  usageLimit: number;
  usageCount: number;
  minOrderAmount: number;
  targetProducts: string[];
  targetCategories: string[];
  createdAt: string;
}

interface CampaignList {
  items: Campaign[];
  total: number;
}

interface DeleteResponse {
  success: boolean;
}

interface PromoValidationResponse {
  valid: boolean;
  message: string;
  discount: { type: string; value: number; maxDiscount: number };
  discountAmount: number;
}

interface PromoApplicationResponse {
  success: boolean;
  discountApplied: number;
  message: string;
}

interface CampaignStats {
  campaignId: string;
  totalUses: number;
  totalDiscountGiven: number;
  uniqueUsers: number;
  conversionRate: number;
}

interface CampaignServiceGrpc {
  createCampaign(data: {
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
  }): Observable<Campaign>;
  getCampaign(data: { id: string }): Observable<Campaign>;
  listCampaigns(data: {
    status?: string;
    type?: string;
    page?: number;
    limit?: number;
  }): Observable<CampaignList>;
  updateCampaign(data: {
    id: string;
    name?: string;
    description?: string;
    discount?: { type: string; value: number; maxDiscount?: number };
    endDate?: string;
    usageLimit?: number;
    minOrderAmount?: number;
  }): Observable<Campaign>;
  deleteCampaign(data: { id: string }): Observable<DeleteResponse>;
  activateCampaign(data: { id: string }): Observable<Campaign>;
  deactivateCampaign(data: { id: string }): Observable<Campaign>;
  validatePromoCode(data: {
    promoCode: string;
    orderAmount: number;
    productIds?: string[];
  }): Observable<PromoValidationResponse>;
  applyPromoCode(data: {
    promoCode: string;
    orderId: string;
    userId: string;
    orderAmount: number;
  }): Observable<PromoApplicationResponse>;
  getCampaignStats(data: { id: string }): Observable<CampaignStats>;
}

@Injectable()
export class CampaignGateway implements OnModuleInit {
  private campaignService!: CampaignServiceGrpc;

  constructor(
    @Inject('CAMPAIGN_SERVICE') private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.campaignService =
      this.client.getService<CampaignServiceGrpc>('CampaignService');
  }

  create(data: {
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
  }): Observable<Campaign> {
    return this.campaignService.createCampaign(data);
  }

  findOne(id: string): Observable<Campaign> {
    return this.campaignService.getCampaign({ id });
  }

  findAll(
    status?: string,
    type?: string,
    page = 1,
    limit = 20,
  ): Observable<CampaignList> {
    return this.campaignService.listCampaigns({ status, type, page, limit });
  }

  update(
    id: string,
    data: {
      name?: string;
      description?: string;
      discount?: { type: string; value: number; maxDiscount?: number };
      endDate?: string;
      usageLimit?: number;
      minOrderAmount?: number;
    },
  ): Observable<Campaign> {
    return this.campaignService.updateCampaign({ id, ...data });
  }

  delete(id: string): Observable<DeleteResponse> {
    return this.campaignService.deleteCampaign({ id });
  }

  activate(id: string): Observable<Campaign> {
    return this.campaignService.activateCampaign({ id });
  }

  deactivate(id: string): Observable<Campaign> {
    return this.campaignService.deactivateCampaign({ id });
  }

  validatePromo(
    promoCode: string,
    orderAmount: number,
    productIds?: string[],
  ): Observable<PromoValidationResponse> {
    return this.campaignService.validatePromoCode({
      promoCode,
      orderAmount,
      productIds,
    });
  }

  applyPromo(
    promoCode: string,
    orderId: string,
    userId: string,
    orderAmount: number,
  ): Observable<PromoApplicationResponse> {
    return this.campaignService.applyPromoCode({
      promoCode,
      orderId,
      userId,
      orderAmount,
    });
  }

  getStats(id: string): Observable<CampaignStats> {
    return this.campaignService.getCampaignStats({ id });
  }
}
