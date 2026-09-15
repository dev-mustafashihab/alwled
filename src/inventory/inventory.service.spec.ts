import { BadRequestException } from '@nestjs/common';
import { InventoryService } from './inventory.service';

/**
 * Inventory integrity rules: no negative stock, never below the reserved
 * quantity. The DB enforces the same rules with CHECK constraints; these tests
 * pin the service-level behaviour (and the movement log).
 */
describe('InventoryService — integrity', () => {
  const actor = { id: 'owner-1', roles: ['OWNER'], permissions: ['*'] };

  const build = (current: { quantity: number; reservedQuantity: number; lowStockThreshold?: number }) => {
    const movementCreate = jest.fn().mockResolvedValue({ id: 1, type: 'STOCK_IN', quantity: 1 });
    const inventoryUpdate = jest.fn().mockImplementation(({ data }: { data: Record<string, number> }) => ({
      id: 7, productId: 3, quantity: data.quantity ?? current.quantity,
      reservedQuantity: current.reservedQuantity, lowStockThreshold: current.lowStockThreshold ?? 5,
      createdAt: new Date(), updatedAt: new Date(),
    }));
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          id: 7,
          quantity: current.quantity,
          reserved_quantity: current.reservedQuantity,
          low_stock_threshold: current.lowStockThreshold ?? 5,
        },
      ]),
      inventory: { update: inventoryUpdate },
      inventoryMovement: { create: movementCreate },
    };
    const prisma = { $transaction: (fn: (t: unknown) => unknown) => fn(tx) };
    const audit = { log: jest.fn() };
    const service = new InventoryService(prisma as never, audit as never);
    return { service, inventoryUpdate, movementCreate, audit };
  };

  it('applies a positive adjustment and logs a STOCK_IN movement', async () => {
    const { service, movementCreate, audit } = build({ quantity: 5, reservedQuantity: 0 });
    const result = await service.adjust(3, { quantity: 10, reason: 'STOCK_RECEIVED' }, actor);
    expect(result.quantity).toBe(15);
    expect(result.availableQuantity).toBe(15);
    expect(movementCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'STOCK_IN', quantity: 10 }) }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'INVENTORY_ADJUSTED', metadata: expect.objectContaining({ delta: 10 }) }),
    );
  });

  it('derives STOCK_OUT for negative deltas', async () => {
    const { service, movementCreate } = build({ quantity: 5, reservedQuantity: 0 });
    const result = await service.adjust(3, { quantity: -3, reason: 'DAMAGED' }, actor);
    expect(result.quantity).toBe(2);
    expect(movementCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'STOCK_OUT', quantity: -3 }) }),
    );
  });

  it('rejects a zero delta', async () => {
    const { service } = build({ quantity: 5, reservedQuantity: 0 });
    await expect(service.adjust(3, { quantity: 0, reason: 'x' }, actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an adjustment that would push quantity negative', async () => {
    const { service, inventoryUpdate } = build({ quantity: 4, reservedQuantity: 0 });
    await expect(service.adjust(3, { quantity: -5, reason: 'LOSS' }, actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(inventoryUpdate).not.toHaveBeenCalled();
  });

  it('rejects an adjustment that would fall below the reserved quantity', async () => {
    const { service } = build({ quantity: 10, reservedQuantity: 8 });
    await expect(service.adjust(3, { quantity: -5, reason: 'LOSS' }, actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an absolute set below the reserved quantity', async () => {
    const { service } = build({ quantity: 10, reservedQuantity: 8 });
    await expect(service.update(3, { quantity: 5 }, actor)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('computes availableQuantity and low-stock flags', async () => {
    const { service } = build({ quantity: 6, reservedQuantity: 2, lowStockThreshold: 10 });
    const result = await service.update(3, { lowStockThreshold: 10 }, actor);
    expect(result.availableQuantity).toBe(4);
    expect(result.isLowStock).toBe(true);
    expect(result.isOutOfStock).toBe(false);
  });

  it('records an ADJUSTMENT movement when the quantity is set directly', async () => {
    const { service, movementCreate } = build({ quantity: 10, reservedQuantity: 0 });
    await service.update(3, { quantity: 25 }, actor);
    expect(movementCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'ADJUSTMENT', quantity: 15, reason: 'MANUAL_SET' }),
      }),
    );
  });
});
