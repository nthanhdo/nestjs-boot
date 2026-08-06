import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { CampaignGateway } from './campaign.gateway';

class CreateCampaignDto {
  name!: string;
  description?: string;
  type!: string;
  promoCode?: string;
  discount!: { type: string; value: number; maxDiscount?: number };
  startDate!: string;
  endDate!: string;
  usageLimit?: number;
  minOrderAmount?: number;
  targetProducts?: string[];
  targetCategories?: string[];
}

class UpdateCampaignDto {
  name?: string;
  description?: string;
  discount?: { type: string; value: number; maxDiscount?: number };
  endDate?: string;
  usageLimit?: number;
  minOrderAmount?: number;
}

class ValidatePromoDto {
  promoCode!: string;
  orderAmount!: number;
  productIds?: string[];
}

class ApplyPromoDto {
  promoCode!: string;
  orderId!: string;
  userId!: string;
  orderAmount!: number;
}

@Controller('campaigns')
export class CampaignController {
  constructor(private readonly campaignGateway: CampaignGateway) {}

  @Post()
  create(@Body() dto: CreateCampaignDto) {
    return this.campaignGateway.create(dto);
  }

  @Get()
  findAll(
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.campaignGateway.findAll(
      status,
      type,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.campaignGateway.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCampaignDto) {
    return this.campaignGateway.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.campaignGateway.delete(id);
  }

  @Post(':id/activate')
  activate(@Param('id') id: string) {
    return this.campaignGateway.activate(id);
  }

  @Post(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.campaignGateway.deactivate(id);
  }

  @Post('promo/validate')
  validatePromo(@Body() dto: ValidatePromoDto) {
    return this.campaignGateway.validatePromo(
      dto.promoCode,
      dto.orderAmount,
      dto.productIds,
    );
  }

  @Post('promo/apply')
  applyPromo(@Body() dto: ApplyPromoDto) {
    return this.campaignGateway.applyPromo(
      dto.promoCode,
      dto.orderId,
      dto.userId,
      dto.orderAmount,
    );
  }

  @Get(':id/stats')
  getStats(@Param('id') id: string) {
    return this.campaignGateway.getStats(id);
  }
}
