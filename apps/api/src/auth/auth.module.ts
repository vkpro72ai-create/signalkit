import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { optionalEnv } from '@signalkit/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [
    JwtModule.register({
      // In production main.ts has already asserted JWT_SECRET exists.
      secret: optionalEnv('JWT_SECRET', 'dev-insecure-secret'),
      signOptions: { expiresIn: optionalEnv('JWT_EXPIRES_IN', '7d') },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
