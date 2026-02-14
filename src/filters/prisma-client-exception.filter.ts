import { ArgumentsHost, Catch, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Response } from 'express';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

@Catch(PrismaClientKnownRequestError)
export class PrismaClientExceptionFilter extends BaseExceptionFilter {
  catch(exception: PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const message = exception.message.replace(/\n/g, '');

    switch (exception.code) {
      case 'P2002': {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const key =
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          exception.meta?.target?.join(', ') || exception.meta?.field_name;
        const status = HttpStatus.BAD_REQUEST;
        response.status(status).json({
          statusCode: status,
          message: `Нарушена уникальность по ключам: ${key}`,
        });
        break;
      }
      case 'P2003': {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const key =
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          exception.meta?.target?.join(', ') || exception.meta?.field_name;
        const status = HttpStatus.BAD_REQUEST;
        response.status(status).json({
          statusCode: status,
          message: `Нарушена уникальность по ключам: ${key}`,
        });
        break;
      }
      default:
        // default 500 error code
        super.catch(exception, host);
        break;
    }
  }
}
