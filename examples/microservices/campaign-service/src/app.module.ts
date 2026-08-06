import { Module } from '@nestjs/common';
import { DatabaseModule } from 'nestjs-boot';
import { CampaignController } from './campaign.controller';
import { CampaignService } from './campaign.service';
import { Campaign, CampaignSchema } from './schemas/campaign.schema';
import {
  CampaignUsage,
  CampaignUsageSchema,
} from './schemas/campaign-usage.schema';

@Module({
  imports: [
    DatabaseModule.forFeature('master', [
      { name: Campaign.name, schema: CampaignSchema },
      { name: CampaignUsage.name, schema: CampaignUsageSchema },
    ]),
  ],
  controllers: [CampaignController],
  providers: [CampaignService],
})
export class AppModule {}
