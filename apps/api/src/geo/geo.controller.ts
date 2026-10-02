import { Body, Controller, Delete, Get, Put, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { GeoService } from './geo.service';
import { ResolveMarketDto, SetGeoConsentDto } from './dto/geo.dto';

@ApiTags('geo')
@Controller()
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Public()
  @Get('geo/countries')
  @ApiOperation({ summary: 'Reference list of countries' })
  countries() {
    return this.geo.listCountries();
  }

  @Public()
  @Get('geo/regions')
  @ApiOperation({ summary: 'Reference list of regions (optionally by country)' })
  regions(@Query('country') country?: string) {
    return this.geo.listRegions(country);
  }

  @Get('geo/detect')
  @ApiOperation({ summary: 'Coarse country suggestion from request headers (country-only)' })
  detect(@Req() req: Request) {
    return this.geo.detectCountry(req.headers as Record<string, string | string[] | undefined>);
  }

  @Put('me/geo-consent')
  @ApiOperation({ summary: 'Set geolocation consent (self). Stores at most country/region.' })
  setConsent(@Body() dto: SetGeoConsentDto, @CurrentUser() user: JwtPayload) {
    return this.geo.setConsent(user.sub, dto);
  }

  @Delete('me/location')
  @ApiOperation({ summary: 'Clear all location data and revoke consent (self)' })
  clearLocation(@CurrentUser() user: JwtPayload) {
    return this.geo.clearLocation(user.sub);
  }

  @Post('geo/resolve-market')
  @ApiOperation({ summary: 'Resolve a concrete market for a scope (consent-gated)' })
  resolveMarket(@Body() dto: ResolveMarketDto, @CurrentUser() user: JwtPayload) {
    return this.geo.resolveMarket(user.sub, dto);
  }
}
