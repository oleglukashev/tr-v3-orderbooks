import {
  Injectable,
  OnModuleInit,
  INestApplication,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '.db/bidasks/generated';

@Injectable()
export class BidasksPrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(BidasksPrismaService.name);

  constructor() {
    super({ log: [{ emit: 'event', level: 'query' }] });
    this.logger.log(`Prisma v${PrismaClient.name}`);
  }

  async onModuleInit() {
    console.log('Prisma: new connection');
    await this.$connect();
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    //this.$on('query', (e) => console.log(`${e.query} ${e.params}`));
    this.$use(async (params, next) => {
      const before = Date.now();
      const result = await next(params);
      const after = Date.now();
      // console.log(
      //   `Query ${params.model}.${params.action} took ${after - before}ms`,
      // );

      return result;
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async enableShutdownHooks(app: INestApplication) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    this.$on('beforeExit', async () => {
      await app.close();
    });
  }
}
