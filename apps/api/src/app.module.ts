import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { validateEnv } from './config/env';
import { DatabaseModule } from './database/database.module';
import { BooksModule } from './books/books.module';
import { CommentsModule } from './comments/comments.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { M2cModule } from './m2c/m2c.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
        serverSelectionTimeoutMS: 5000,
        autoIndex: config.get<string>('NODE_ENV') !== 'production',
      }),
    }),
    DatabaseModule,
    AuthModule,
    M2cModule,
    BooksModule,
    CommentsModule,
    HealthModule,
  ],
})
export class AppModule {}
