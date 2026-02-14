import {
  XOR,
  PostSelect,
  UserWhereInput,
  PostOrderByInput,
  Enumerable,
  PostInclude,
} from 'prisma';
import { GeneralPrismaService } from '../generalPrisma/generalPrisma.service';
//import { KlinesPrismaService } from '../klinesPrisma/klinesPrisma.service';
import { OrderbooksPrismaService } from '../orderbooksPrisma/orderbooksPrisma.service';

interface IFind {
  where?: UserWhereInput;
  page?: number;
  orderBy?: XOR<Enumerable<PostOrderByInput>, PostOrderByInput>;
  select?: XOR<PostSelect, null>;
  take?: any;
  include?: XOR<PostInclude, null>;
}

export class Base {
  constructor(
    prismaService:
      | GeneralPrismaService
      //| KlinesPrismaService
      | OrderbooksPrismaService,
    protected readonly prismaDomain: string,
  ) {
    this.prismaService = prismaService;
  }

  static readonly DEFAULT_PAGE_SIZE: number = 50;
  txPrismaDomain: any = null;
  prismaService: any = null;
  skippedAttrs: string[] = [];

  async findManyWithPagination({
    where,
    orderBy,
    select,
    include,
    page,
    take,
  }: IFind) {
    page = this.getPage(page);
    const params = Object.assign(
      {},
      {
        where,
        orderBy,
        select,
        include,
      },
      {
        skip: page ? page * Base.DEFAULT_PAGE_SIZE : 0,
        take: take || Base.DEFAULT_PAGE_SIZE,
      },
    );
    return (await this._prismaDomain().findMany(params)) || [];
  }

  async findFirst({ where, orderBy, select, include }: IFind) {
    return this._prismaDomain().findFirst({
      where,
      orderBy,
      select,
      include,
    });
  }

  async findMany({ where, orderBy, select, take, include }: IFind) {
    return (
      (await this._prismaDomain().findMany({
        where,
        orderBy,
        select,
        take,
        include,
      })) || []
    );
  }

  async baseCreate(data): Promise<any> {
    data = await this.preBaseCreate(data);
    const dataWithoutSkippedAttrs = {};
    for (const key in data) {
      if (!this.skippedAttrs.includes(key)) {
        dataWithoutSkippedAttrs[key] = data[key];
      }
    }
    const result = await this._prismaDomain().create({
      data: dataWithoutSkippedAttrs,
    });
    await this.afterBaseCreate(result, data);
    return result;
  }

  public async preBaseCreate(data): Promise<any> {
    return data;
  }

  public async afterBaseCreate(entity, data): Promise<any> {
    return entity;
  }

  async baseUpdateMany(params: any) {
    return this._prismaDomain().updateMany(params);
  }

  async baseUpdate(id: number | string, data: any) {
    data = await this.preBaseUpdate(data);
    const dataWithoutSkippedAttrs = {};
    for (const key in data) {
      if (!this.skippedAttrs.includes(key)) {
        dataWithoutSkippedAttrs[key] = data[key];
      }
    }
    const result = await this._prismaDomain().update({
      where: { id },
      data: dataWithoutSkippedAttrs,
    });
    await this.afterBaseUpdate(result, data);
    return result;
  }

  public async preBaseUpdate(data): Promise<any> {
    return data;
  }

  public async afterBaseUpdate(entity, data): Promise<any> {
    return entity;
  }

  public async baseUpsert({ where, update, create }): Promise<any> {
    update = await this.preBaseUpdate(update);
    create = await this.preBaseCreate(create);
    return this._prismaDomain().upsert({
      where,
      update,
      create,
    });
  }

  async baseRemove(id: number | string | object): Promise<void> {
    await this.preBaseRemove();
    if (typeof id === 'object') {
      await this._prismaDomain().deleteMany({
        where: { id: { in: id } },
      });
    } else {
      const entity = await this._prismaDomain().findFirst({ where: { id } });
      await this._prismaDomain().delete({ where: { id } });
      await this.afterBaseRemove(entity);
    }
    return;
  }

  public async preBaseRemove(): Promise<any> {
    return;
  }

  public async afterBaseRemove(entity): Promise<any> {
    return;
  }

  async baseRemoveBy(
    key: string,
    value: number | string | object,
  ): Promise<void> {
    if (typeof value === 'object') {
      return this._prismaDomain().deleteMany({
        where: { [key]: { in: value } },
      });
    } else {
      return this._prismaDomain().deleteMany({ where: { [key]: value } });
    }
  }

  async baseRemoveAll(): Promise<void> {
    return this._prismaDomain().deleteMany({});
  }

  async pages(where): Promise<number> {
    return Math.ceil((await this.countBy(where)) / Base.DEFAULT_PAGE_SIZE);
  }

  countBy(where): Promise<number> {
    return this._prismaDomain().count({ where });
  }

  getPage(page: number) {
    return page ? page - 1 : 0;
  }

  async upsert(params): Promise<any> {
    return this._prismaDomain().upsert(params);
  }

  async entitiesCollection({
    where,
    include,
    orderBy,
    page,
    take,
    select,
  }: any) {
    const result: any = {
      items: page
        ? await this.findManyWithPagination({
            where,
            include,
            orderBy,
            page,
            select,
            take,
          })
        : await this.findMany({
            where,
            include,
            orderBy,
            select,
            take: take || Base.DEFAULT_PAGE_SIZE,
          }),
    };

    if (typeof page !== 'undefined') {
      result.totalPages = await this.pages(where);
      result.totalItems = await this.countBy(where);
      result.page = page;
    }

    return result;
  }

  async entitiesCollectionAsSelectbox({ labelField, where }: any) {
    let result = await this.collectionForSelectbox({ labelField, where });

    result = result.map((item) => {
      return { id: item.id, label: item[labelField] };
    });

    return { items: result };
  }

  async collectionForSelectbox({ labelField, where }: any) {
    const select = {
      id: true,
    };

    if (typeof labelField === 'string') {
      select[labelField] = true;
    } else {
      for (const field of labelField) {
        select[field] = true;
      }
    }

    return this.findMany({
      select,
      where,
      take: 100,
      orderBy: { id: 'asc' },
    });
  }

  async transaction(
    action,
    setTxPrismaDomainCallback?,
    clearTxPrismaDomainCallback?,
  ) {
    return this.prismaService.$transaction(async (trxClient) => {
      try {
        this.setTxPrismaDomain(trxClient);
        if (setTxPrismaDomainCallback) {
          setTxPrismaDomainCallback(trxClient);
        }
        const result = await action(trxClient);
        this.clearTxPrismaDomain();
        if (clearTxPrismaDomainCallback) {
          clearTxPrismaDomainCallback();
        }
        return result;
      } catch (e) {
        this.clearTxPrismaDomain();
        if (clearTxPrismaDomainCallback) {
          clearTxPrismaDomainCallback();
        }
        console.log(`Prisma transaction scope error: ${e}`);
        throw e;
      }
    });
  }

  setTxPrismaDomain(trxClient: any) {
    this.txPrismaDomain = trxClient[this.prismaDomain];
  }

  clearTxPrismaDomain() {
    this.txPrismaDomain = null;
  }

  private _prismaDomain() {
    return this.txPrismaDomain || this.defaultPrismaDomain();
  }

  private defaultPrismaDomain() {
    return this.prismaService[this.prismaDomain];
  }

  protected transformFieldToForeignKey(key: string, data: any) {
    if (key.includes('Id') && key in data) {
      if (data[key]) {
        data[key.slice(0, -2)] = { connect: { id: data[key] } };
      }

      delete data[key];
    }
  }
}
