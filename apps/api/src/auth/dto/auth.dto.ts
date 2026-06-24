import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'founder@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, example: 'correct horse battery' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ required: false, example: 'Ada Lovelace' })
  @IsOptional()
  @IsString()
  displayName?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'founder@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'correct horse battery' })
  @IsString()
  password!: string;
}

export class AuthTokenResponse {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  userId!: string;
}
