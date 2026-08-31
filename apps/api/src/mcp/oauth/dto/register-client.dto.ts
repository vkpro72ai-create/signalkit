import { IsArray, IsOptional, IsString, IsUrl } from 'class-validator';

/** RFC 7591 Dynamic Client Registration request — only the fields A1 uses. */
export class RegisterClientDto {
  @IsString()
  @IsOptional()
  client_name?: string;

  @IsArray()
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['https', 'http'] }, { each: true })
  redirect_uris!: string[];

  @IsArray()
  @IsOptional()
  grant_types?: string[];

  @IsString()
  @IsOptional()
  software_id?: string;
}
