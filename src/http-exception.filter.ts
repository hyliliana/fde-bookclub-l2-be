import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body && ('fieldErrors' in body || 'database' in body || (status !== 404 && status !== 400))) {
        response.status(status).json(body);
        return;
      }
      // Controller messages are safe; framework validation and parsing messages are translated.
      const message = typeof body === 'object' && body && 'message' in body ? body.message : body;
      const koreanMessage = typeof message === 'string' && /[가-힣]/.test(message)
        ? message
        : status === 404 ? '요청한 페이지를 찾을 수 없습니다.' : '요청 내용을 확인해 주세요.';
      response.status(status).json({ message: koreanMessage });
      return;
    }
    response.status(500).json({ message: '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
  }
}
