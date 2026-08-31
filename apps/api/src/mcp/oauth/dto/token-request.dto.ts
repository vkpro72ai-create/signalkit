import { IsIn, IsOptional, IsString } from 'class-validator';

/**
 * RFC 6749 §4.1.3 / §6 token request — grant-specific fields are validated
 * conditionally inside OAuthTokenService rather than with a discriminated
 * union of DTOs, since the request body is form-encoded and grant_type
 * selects which other fields are required.
 */
export class TokenRequestDto {
  @IsIn(['authorization_code', 'refresh_token'])
  grant_type!: 'authorization_code' | 'refresh_token';

  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  redirect_uri?: string;

  @IsString()
  @IsOptional()
  code_verifier?: string;

  @IsString()
  @IsOptional()
  refresh_token?: string;

  @IsString()
  client_id!: string;
}
