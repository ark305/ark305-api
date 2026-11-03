import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Header, HttpCode, Param,
  Patch, Post, Put, Query, Req, UnauthorizedException,
} from '@nestjs/common';
import { Answers, buildSnapshot, sanitize } from '../../domain/diagnosis';
import { parseSide, sideToExperience } from '../../domain/mode';
import { AuthenticatedRequest } from '../identity/identity.guard';
import { Public } from '../identity/public.decorator';
import { ProfileInput, ProfilesPort, ServiceInput } from './profiles.port';

const HANDLE = /^[a-z0-9._]{3,30}$/;
const RESERVED = new Set(['admin', 'ark', 'arkai', 'soporte', 'support', 'perfil', 'private', 'lente305', 'bluewater', 'chefadri', 'valentinar', 'skyview', 'noches305', 'danielm', 'aeroframe', 'miamiblackcar', 'camila.edita', 'mateo.cm', 'casalimpia', 'clipkitchen', 'handy305', 'mesa305', 'sunsetcharters', 'ark305', 'bayfrontprivate', 'studiomarfil', 'atlasaviation', 'oceanfleet']);
const KINDS = ['member', 'provider', 'creator', 'remote', 'brand'];
const ACTIONS = ['book', 'request', 'view'];
const PUBLIC_PROFILE_FIELDS = ['handle', 'name', 'kind', 'role', 'area', 'tagline', 'photo_url', 'banner_url', 'gallery', 'instagram', 'tiktok', 'facebook', 'bio_link', 'shared'];
const PHOTO_PREFIX = (id: string) => `${process.env.SUPABASE_URL ?? ''}/storage/v1/object/public/media/${id}/`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(code: 'name' | 'handle' | 'title' | 'price' | 'photo') {
  return new BadRequestException({ code, message: 'Invalid profile input' });
}

function accessToken(request: AuthenticatedRequest): string {
  const match = typeof request.headers.authorization === 'string' && /^Bearer ([^\s,]+)$/i.exec(request.headers.authorization);
  if (!request.principal || !match) throw new UnauthorizedException();
  return match[1];
}

function validateProfile(input: unknown, ownerId: string, create: boolean): ProfileInput {
  if (!isRecord(input) || Object.keys(input).some((key) => !['name', 'handle', 'kind', 'role', 'area', 'tagline', 'photo_url', 'banner_url', 'gallery', 'instagram', 'tiktok', 'facebook'].includes(key))) {
    throw new BadRequestException('Invalid profile');
  }
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 60) : '';
  const handle = typeof input.handle === 'string' ? input.handle.trim().slice(0, 30).toLowerCase() : '';
  if (!name) throw invalid('name');
  if (!HANDLE.test(handle) || RESERVED.has(handle)) throw invalid('handle');
  const photo = (key: string) => {
    const value = input[key];
    if (value === null || value === '') return null;
    if (typeof value !== 'string' || value.length > 500 || !value.startsWith(PHOTO_PREFIX(ownerId))) throw invalid('photo');
    return value;
  };
  const result: ProfileInput = {
    name, handle, kind: KINDS.includes(String(input.kind)) ? input.kind : 'member',
    role: String(input.role ?? '').trim().slice(0, 60), area: String(input.area ?? '').trim().slice(0, 60),
    photo_url: photo('photo_url'),
  };
  if (create) return result;
  result.tagline = String(input.tagline ?? '').trim().slice(0, 80);
  result.banner_url = photo('banner_url');
  result.gallery = (Array.isArray(input.gallery) ? input.gallery : []).map((value) => {
    if (typeof value !== 'string' || !value) return null;
    return value.startsWith(PHOTO_PREFIX(ownerId)) && value.length <= 500 ? value : false;
  }).filter((value): value is string => typeof value === 'string').slice(0, 12);
  for (const key of ['instagram', 'tiktok', 'facebook']) {
    result[key] = socialUrl(String(input[key] ?? '').trim().slice(0, 200));
  }
  return result;
}

function socialUrl(value: string): string | null {
  if (!value) return null;
  const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try { return new URL(normalized).protocol.startsWith('http') ? normalized.slice(0, 200) : null; } catch { return null; }
}

function validateService(input: unknown, ownerId: string): ServiceInput {
  if (!isRecord(input) || Object.keys(input).some((key) => !['title', 'kicker', 'detail', 'price', 'action', 'photo_url'].includes(key))) throw new BadRequestException('Invalid service');
  const title = typeof input.title === 'string' ? input.title.trim().slice(0, 80) : '';
  if (!title) throw invalid('title');
  const price = Number(String(input.price ?? '').trim().slice(0, 10));
  if (!Number.isInteger(price) || price < 0 || price > 1_000_000) throw invalid('price');
  const photo = input.photo_url === null || input.photo_url === '' ? null : input.photo_url;
  if (photo !== null && (typeof photo !== 'string' || photo.length > 500 || !photo.startsWith(PHOTO_PREFIX(ownerId)))) throw invalid('photo');
  return { title, kicker: String(input.kicker ?? '').trim().slice(0, 30), detail: String(input.detail ?? '').trim().slice(0, 80), price,
    action: ACTIONS.includes(String(input.action)) ? input.action : 'book', photo_url: photo };
}

@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesPort) {}

  @Post('snapshot') @Public() @HttpCode(200) @Header('Cache-Control', 'no-store')
  snapshot(@Body() body: unknown) {
    if (!isRecord(body) || Object.keys(body).length !== 1 || !isRecord(body.answers) ||
        Object.keys(body.answers).length > 80 || Buffer.byteLength(JSON.stringify(body), 'utf8') > 16_384) {
      throw new BadRequestException('Invalid snapshot input');
    }
    const answers = sanitize(body.answers);
    return { snapshot: buildSnapshot(answers) };
  }

  @Get('me') @Header('Cache-Control', 'no-store')
  async viewer(@Req() request: AuthenticatedRequest) {
    const token = accessToken(request); const id = request.principal!.id;
    const [profile, services] = await Promise.all([this.profiles.findOwn(token, id), this.profiles.listServices(token, id)]);
    return { userId: id, row: profile, services, email: null };
  }

  @Get('check-handle') @Header('Cache-Control', 'no-store')
  async checkHandle(@Req() request: AuthenticatedRequest, @Query('handle') value = '') {
    const token = accessToken(request); const handle = value.trim().toLowerCase();
    if (!HANDLE.test(handle)) return { status: 'invalid' };
    if (RESERVED.has(handle)) return { status: 'taken' };
    return { status: await this.profiles.handleTaken(token, handle, request.principal!.id) ? 'taken' : 'available' };
  }

  @Post('me') @Header('Cache-Control', 'no-store')
  async createProfile(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const token = accessToken(request); const ownerId = request.principal!.id; const value = validateProfile(body, ownerId, true);
    if (await this.profiles.handleTaken(token, String(value.handle))) throw invalid('handle');
    const profile = await this.profiles.createProfile(token, ownerId, { ...value, id: ownerId });
    if (!profile) throw new BadRequestException('Profile was not created');
    return profile;
  }

  @Patch('me') @Header('Cache-Control', 'no-store')
  async updateProfile(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const token = accessToken(request); const ownerId = request.principal!.id; const value = validateProfile(body, ownerId, false);
    if (await this.profiles.handleTaken(token, String(value.handle), ownerId)) throw invalid('handle');
    const profile = await this.profiles.updateProfile(token, ownerId, value);
    if (!profile) throw new BadRequestException('Profile was not updated');
    return profile;
  }

  @Post('me/services') @Header('Cache-Control', 'no-store')
  async createService(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const token = accessToken(request); const id = request.principal!.id; const value = validateService(body, id);
    const record = await this.profiles.saveService(token, id, undefined, { ...value, owner: id, position: Date.now() % 1_000_000_000 });
    if (!record) throw new BadRequestException('Service was not created'); return record;
  }

  @Patch('me/services/:id') @Header('Cache-Control', 'no-store')
  async updateService(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    const token = accessToken(request); const owner = request.principal!.id;
    const record = await this.profiles.saveService(token, owner, id, validateService(body, owner));
    if (!record) throw new BadRequestException('Service was not updated'); return record;
  }

  @Delete('me/services/:id') @Header('Cache-Control', 'no-store')
  async deleteService(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    await this.profiles.deleteService(accessToken(request), request.principal!.id, id); return { ok: true };
  }

  @Patch('me/steps/:step') @Header('Cache-Control', 'no-store')
  async markStep(@Req() request: AuthenticatedRequest, @Param('step') step: string) {
    if (!['bio_link', 'shared'].includes(step)) throw new BadRequestException('Invalid profile step');
    await this.profiles.updateOwn(accessToken(request), request.principal!.id, { [step]: true }); return { ok: true };
  }

  @Patch('me/taste') @Header('Cache-Control', 'no-store')
  async saveTaste(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    if (!isRecord(body) || !isRecord(body.taste)) throw new BadRequestException('Invalid taste');
    const clean = Object.fromEntries(Object.entries(body.taste).filter(([key, value]) => /^[a-z-]{2,20}$/.test(key) && Number.isFinite(value))
      .slice(0, 40).map(([key, value]) => [key, Math.max(-50, Math.min(200, Math.round(Number(value))))]));
    await this.profiles.updateOwn(accessToken(request), request.principal!.id, { taste: clean }); return { ok: true };
  }

  @Patch('me/side') @Header('Cache-Control', 'no-store')
  async saveSide(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const side = isRecord(body) && typeof body.side === 'string' ? parseSide(body.side) : null;
    if (!side) throw new BadRequestException('Invalid side');
    await this.profiles.updateOwn(accessToken(request), request.principal!.id, { experience: sideToExperience(side) }); return { ok: true };
  }

  @Put('me/diagnosis') @Header('Cache-Control', 'no-store')
  async saveDiagnosis(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    if (!isRecord(body)) throw new BadRequestException('Invalid diagnosis');
    const ownerId = request.principal!.id;
    if (body.expectedUserId && body.expectedUserId !== ownerId) throw new ForbiddenException();
    const answers = sanitize(body.answers); const snapshot = buildSnapshot(answers);
    if (!snapshot) return { ok: false };
    const update: ProfileInput = { diagnosis: { answers: answers as Answers, at: new Date().toISOString() } };
    if (body.applySide !== false) update.experience = sideToExperience(snapshot.side);
    const ok = await this.profiles.updateOwn(accessToken(request), ownerId, update);
    return { ok, ...(body.applySide === false ? {} : { side: snapshot.side }) };
  }

  @Delete('me/diagnosis') @Header('Cache-Control', 'no-store')
  async clearDiagnosis(@Req() request: AuthenticatedRequest) {
    await this.profiles.updateOwn(accessToken(request), request.principal!.id, { diagnosis: null, taste: {} }); return { ok: true };
  }

  @Get('handle/:handle') @Public() @Header('Cache-Control', 'no-store')
  async publicProfile(@Param('handle') handle: string) {
    const row = await this.profiles.findPublic('', handle.toLowerCase());
    if (!row) return { profile: null, services: [] };
    const id = String(row.id);
    const profile = Object.fromEntries(PUBLIC_PROFILE_FIELDS.filter((key) => key in row).map((key) => [key, row[key]]));
    return { profile, services: await this.profiles.listServices('', id) };
  }

  @Get('recent') @Public() @Header('Cache-Control', 'no-store')
  async recent(@Query('limit') value = '24') {
    const limit = Number(value); if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException('Invalid profile limit');
    const rows = await this.profiles.recent('', limit);
    return { items: rows.map((row) => Object.fromEntries(PUBLIC_PROFILE_FIELDS.filter((key) => key in row).map((key) => [key, row[key]]))) };
  }
}
