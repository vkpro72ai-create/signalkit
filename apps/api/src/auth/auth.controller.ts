import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { RegisterDto, LoginDto, AuthTokenResponse } from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  register(@Body() dto: RegisterDto): Promise<AuthTokenResponse> {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Log in and receive an access token' })
  login(@Body() dto: LoginDto): Promise<AuthTokenResponse> {
    return this.auth.login(dto);
  }
}
