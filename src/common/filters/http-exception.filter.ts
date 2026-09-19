import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { getRequestId, safeLogPath } from '../middleware/request-id.middleware';

export interface ApiError {
  field?: string;
  message: string;
}

export interface ApiResponse<T = null> {
  success: boolean;
  message: string;
  data?: T;
  errors?: ApiError[];
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  /** Prisma/Postgres errors that mean "the client sent something invalid", not a server fault. */
  private static readonly INVALID_INPUT_CODES = new Set([
    'P2000', // value too long for the column
    'P2005', // stored value has the wrong type for the field
    'P2006', // provided value is not valid for the field
    'P2007', // data validation error
    'P2010', // raw query failed
    'P2011', // null constraint violation
    'P2019', // input error
    'P2020', // value out of range for the type (e.g. integer overflow)
    'P2023', // inconsistent column data
    'P2033', // number larger than a 64-bit signed integer
    '22003', // numeric_value_out_of_range (postgres)
    '22P02', // invalid_text_representation (postgres)
    '22001', // string_data_right_truncation (postgres)
    '22021', // character_not_in_repertoire (e.g. NUL byte in text)
    '22018', // invalid_character_value_for_cast
  ]);

  /** Driver messages that always mean bad client input (never leak them verbatim). */
  private static readonly INVALID_INPUT_PATTERNS = [
    /out of range/i,
    /invalid byte sequence/i,
    /invalid input syntax/i,
    /value too long/i,
    /numeric field overflow/i,
    /incorrect binary data/i,
    /unsupported character/i,
  ];

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: ApiError[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object') {
        const b = body as Record<string, unknown>;
        message = (b.message as string) ?? exception.message;
        if (Array.isArray(b.message)) {
          errors = (b.message as string[]).map((m) => ({ message: m }));
          message = 'Validation failed';
        }
      }
    } else if (exception instanceof Error) {
      const name = exception.name;
      const code = (exception as { code?: string }).code;
      const tooLarge = name === 'PayloadTooLargeError' || (exception as { status?: number }).status === 413;
      if (tooLarge) {
        // body-parser rejects oversized payloads with a plain error, never leak it as a 500
        status = HttpStatus.PAYLOAD_TOO_LARGE;
        message = 'حجم البيانات المُرسلة كبير جداً';
      } else if (
        name === 'PrismaClientValidationError' ||
        name === 'PrismaClientKnownRequestError' && Boolean(code && HttpExceptionFilter.INVALID_INPUT_CODES.has(code)) ||
        (code && HttpExceptionFilter.INVALID_INPUT_CODES.has(code)) ||
        HttpExceptionFilter.INVALID_INPUT_PATTERNS.some((re) => re.test(exception.message)) ||
        /Invalid value provided|Argument .* is missing|Unknown argument/i.test(exception.message)
      ) {
        status = HttpStatus.BAD_REQUEST;
        message = 'قيمة غير صالحة في الطلب';
        this.logger.warn(`${req.method} ${safeLogPath(req.originalUrl || req.url)} → 400 (${name}/${code}) rid=${getRequestId(req)}`);
      } else {
        // السجل يحتفظ بالأثر للتشخيص، أما الرد فلا يكشف أي شيء (رسالة عامة أدناه).
        this.logger.error(`${req.method} ${safeLogPath(req.originalUrl || req.url)} rid=${getRequestId(req)} :: ${exception.message}`, exception.stack);
      }
    }

    res.status(status).json({
      success: false,
      message:
        status >= 500 ? 'Internal server error' : message,
      ...(errors ? { errors } : {}),
    } as ApiResponse);
  }
}
