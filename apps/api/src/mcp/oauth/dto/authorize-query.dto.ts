import { IsIn, IsOptional, IsString } from 'class-validator';

export class AuthorizeQueryDto {
  @IsIn(['code'])
  response_type!: 'code';

  @IsString()
  client_id!: string;

  @IsString()
  redirect_uri!: string;

  @IsString()
  @IsOptional()
  scope?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  code_challenge!: string;

  @IsIn(['S256'])
  code_challenge_method!: 'S256';
}
