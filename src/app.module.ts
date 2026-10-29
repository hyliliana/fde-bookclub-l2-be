import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { DatabaseService } from './database.service.js';
import { MeetingsService } from './meetings.service.js';
@Module({ controllers: [AppController], providers: [DatabaseService, MeetingsService] })
export class AppModule {}
