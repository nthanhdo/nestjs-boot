import { BootEvent } from 'nestjs-boot';

export class CampaignActivatedEvent extends BootEvent {
  constructor(
    public readonly campaignId: string,
    public readonly name: string,
    public readonly promoCode: string,
  ) {
    super();
  }
}

export class CampaignDeactivatedEvent extends BootEvent {
  constructor(
    public readonly campaignId: string,
    public readonly name: string,
    public readonly reason: 'manual' | 'expired' | 'ended',
  ) {
    super();
  }
}

export class CampaignAppliedEvent extends BootEvent {
  constructor(
    public readonly campaignId: string,
    public readonly orderId: string,
    public readonly userId: string,
    public readonly discountApplied: number,
  ) {
    super();
  }
}
