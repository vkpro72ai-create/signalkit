import { IsIn, IsString } from 'class-validator';

export class ConsentDto {
  /** Signed ticket minted by GET /oauth/authorize — carries the validated OAuth request. */
  @IsString()
  ticket!: string;

  @IsString()
  workspaceId!: string;

  @IsIn(['allow', 'deny'])
  decision!: 'allow' | 'deny';
}
