import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CacheService, QueueService } from 'nestjs-boot';
import { ShipmentDocument, ShipmentItemData, AddressData } from './schemas/shipment.schema';
import { InventoryDocument } from './schemas/inventory.schema';

/** Valid status transitions: from → [allowed targets] */
const STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['in_transit', 'delivered'],
  in_transit: ['delivered'],
  delivered: [],
  cancelled: [],
};

@Injectable()
export class FulfillmentService {
  private readonly logger = new Logger(FulfillmentService.name);

  constructor(
    @InjectModel('Shipment')
    private readonly shipmentModel: Model<ShipmentDocument>,
    @InjectModel('Inventory')
    private readonly inventoryModel: Model<InventoryDocument>,
    private readonly cacheService: CacheService,
    private readonly queueService: QueueService,
  ) {}

  async createShipment(
    orderId: string,
    userId: string,
    shippingAddress: AddressData,
    items: ShipmentItemData[],
    carrier: string,
  ): Promise<ShipmentDocument> {
    const shipment = new this.shipmentModel({
      orderId,
      userId,
      shippingAddress,
      items: items.map((i) => ({ ...i, status: 'pending' })),
      carrier: carrier || '',
      status: 'pending',
    });

    const saved = await shipment.save();
    this.logger.log(
      `Shipment created: ${saved._id} for order ${orderId}`,
    );

    // Invalidate user shipment list cache
    await this.cacheService.del(`shipments:user:${userId}`);

    return saved;
  }

  async findOne(id: string): Promise<ShipmentDocument> {
    const cacheKey = `shipment:${id}`;
    const cached = await this.cacheService.get<ShipmentDocument>(cacheKey);
    if (cached) return cached;

    const shipment = await this.shipmentModel.findById(id).exec();
    if (!shipment) {
      throw new NotFoundException(`Shipment ${id} not found`);
    }

    await this.cacheService.set(cacheKey, shipment, 120);
    return shipment;
  }

  async findByOrder(orderId: string): Promise<ShipmentDocument> {
    const cacheKey = `shipment:order:${orderId}`;
    const cached = await this.cacheService.get<ShipmentDocument>(cacheKey);
    if (cached) return cached;

    const shipment = await this.shipmentModel
      .findOne({ orderId })
      .sort({ createdAt: -1 })
      .exec();
    if (!shipment) {
      throw new NotFoundException(`Shipment for order ${orderId} not found`);
    }

    await this.cacheService.set(cacheKey, shipment, 120);
    return shipment;
  }

  async updateStatus(
    id: string,
    status: string,
    trackingNumber?: string,
  ): Promise<ShipmentDocument> {
    const shipment = await this.shipmentModel.findById(id).exec();
    if (!shipment) {
      throw new NotFoundException(`Shipment ${id} not found`);
    }

    // Validate status transition
    const allowed = STATUS_TRANSITIONS[shipment.status];
    if (!allowed || !allowed.includes(status)) {
      throw new BadRequestException(
        `Cannot transition from '${shipment.status}' to '${status}'. Allowed: [${(allowed || []).join(', ')}]`,
      );
    }

    shipment.status = status as ShipmentDocument['status'];

    if (trackingNumber) {
      shipment.trackingNumber = trackingNumber;
    }

    if (status === 'shipped') {
      shipment.shippedAt = new Date();
    } else if (status === 'delivered') {
      shipment.deliveredAt = new Date();
    }

    const saved = await shipment.save();
    this.logger.log(`Shipment ${id} status updated to '${status}'`);

    // Invalidate caches
    await Promise.all([
      this.cacheService.del(`shipment:${id}`),
      this.cacheService.del(`shipment:order:${shipment.orderId}`),
      this.cacheService.del(`shipments:user:${shipment.userId}`),
    ]);

    // Enqueue async status-change processing (e.g. send notification)
    await this.queueService.addJob('fulfillment', 'status-changed', {
      shipmentId: saved._id?.toString(),
      orderId: saved.orderId,
      userId: saved.userId,
      status,
    });

    return saved;
  }

  async listShipments(
    userId?: string,
    status?: string,
    page = 1,
    limit = 20,
  ): Promise<{ items: ShipmentDocument[]; total: number }> {
    const filter: Record<string, string> = {};
    if (userId) filter.userId = userId;
    if (status) filter.status = status;

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.shipmentModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.shipmentModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async reserveInventory(
    items: ShipmentItemData[],
    orderId: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      for (const item of items) {
        const inventory = await this.inventoryModel.findOneAndUpdate(
          {
            productId: item.productId,
            available: { $gte: item.quantity },
          },
          {
            $inc: {
              available: -item.quantity,
              reserved: item.quantity,
            },
          },
          { new: true },
        );

        if (!inventory) {
          // Rollback previously reserved items in this batch
          await this.rollbackReservations(items.slice(0, items.indexOf(item)), orderId);
          return {
            success: false,
            message: `Insufficient inventory for product ${item.productId}`,
          };
        }
      }

      this.logger.log(`Inventory reserved for order ${orderId}: ${items.length} items`);
      return { success: true, message: 'Inventory reserved successfully' };
    } catch (error) {
      this.logger.error(`Failed to reserve inventory for order ${orderId}`, error);
      return { success: false, message: 'Inventory reservation failed' };
    }
  }

  async releaseInventory(
    orderId: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const shipment = await this.shipmentModel
        .findOne({ orderId })
        .exec();

      if (!shipment) {
        return { success: false, message: `No shipment found for order ${orderId}` };
      }

      for (const item of shipment.items) {
        await this.inventoryModel.findOneAndUpdate(
          { productId: item.productId },
          {
            $inc: {
              available: item.quantity,
              reserved: -item.quantity,
            },
          },
        );
      }

      this.logger.log(`Inventory released for order ${orderId}`);
      return { success: true, message: 'Inventory released successfully' };
    } catch (error) {
      this.logger.error(`Failed to release inventory for order ${orderId}`, error);
      return { success: false, message: 'Inventory release failed' };
    }
  }

  private async rollbackReservations(
    items: ShipmentItemData[],
    orderId: string,
  ): Promise<void> {
    for (const item of items) {
      await this.inventoryModel.findOneAndUpdate(
        { productId: item.productId },
        {
          $inc: {
            available: item.quantity,
            reserved: -item.quantity,
          },
        },
      );
    }
    this.logger.warn(`Rolled back inventory reservations for order ${orderId}`);
  }
}
