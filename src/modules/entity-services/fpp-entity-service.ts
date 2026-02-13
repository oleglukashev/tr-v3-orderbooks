import { Injectable } from '@nestjs/common';
import { Base } from './base.service';
import { BidasksPrismaService } from '../bidasksPrisma/bidasksPrisma.service';

@Injectable()
export class FppEntityService extends Base {
  constructor(fppPrismaService: BidasksPrismaService) {
    super(fppPrismaService, 'fpp');
  }

  public override async preBaseCreate(data) {
    return data;
  }

  public override async preBaseUpdate(data) {
    return data;
  }
}
