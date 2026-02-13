import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Catch(Prisma.PrismaClientValidationError)
export class PrismaClientValidationFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientValidationError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    const status = HttpStatus.BAD_REQUEST;

    const params: any = {
      statusCode: status,
    };

    if (process.env.NODE_ENV !== 'production') {
      params.message = exception.message;
    }

    response.status(status).json(params);
  }
}
