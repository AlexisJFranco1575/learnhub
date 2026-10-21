import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

describe('HealthController', () => {
  let controller: HealthController;
  let queryRaw: jest.Mock;

  beforeEach(async () => {
    queryRaw = jest.fn().mockResolvedValue([{ result: 1 }]);

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: { $queryRaw: queryRaw } }],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('returns ok when the database responds', async () => {
    await expect(controller.check()).resolves.toMatchObject({
      status: 'ok',
      database: 'up',
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('reports liveness without touching the database', () => {
    expect(controller.live()).toMatchObject({ status: 'ok' });
    expect(queryRaw).not.toHaveBeenCalled();
  });
});