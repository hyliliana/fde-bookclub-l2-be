import { Body, Controller, Get, HttpCode, Param, Post, Query, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from './database.service.js';
import { MeetingsService } from './meetings.service.js';
import { parseId, parseMember, parseSearch, validateMeetingInput } from './input.js';

@Controller()
export class AppController {
  constructor(private readonly meetings: MeetingsService, private readonly db: DatabaseService) {}
  @Get('books') books() { return this.meetings.books(); }
  @Get('members') members() { return this.meetings.members(); }
  @Get('stats') stats() { return this.meetings.stats(); }
  @Get('meetings') list(@Query('search') search: unknown) { return this.meetings.list(parseSearch(search)); }
  @Get('meetings/:id') detail(@Param('id') id: string) { return this.meetings.detail(parseId(id)); }
  @Post('meetings') create(@Body() body: unknown) { return this.meetings.create(validateMeetingInput(body)); }
  @Post('meetings/:id/registrations') register(@Param('id') id: string, @Body() body: unknown) { return this.meetings.register(parseId(id), parseMember(body)); }
  @Post('meetings/:id/registrations/cancel') @HttpCode(200)
  cancel(@Param('id') id: string, @Body() body: unknown) { return this.meetings.cancel(parseId(id), parseMember(body)); }
  @Get('health') async health() {
    try { await this.db.query('SELECT 1 AS connected'); return { status: 'ok', database: 'connected' }; }
    catch { throw new ServiceUnavailableException({ status: 'error', database: 'disconnected' }); }
  }
}
