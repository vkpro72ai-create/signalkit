import { IsEmail, IsString } from 'class-validator';

/** The consent-flow's own mini-login (browser form POST, sets a short-lived cookie) — reuses
 * AuthService.login() for credential verification, never duplicates password logic. */
export class OAuthLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;

  /** The original /oauth/authorize query string, so login can redirect back into the flow. */
  @IsString()
  continue!: string;
}
