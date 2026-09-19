import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT } from '../audit/audit.actions';
import { CreateSlideDto } from './dto/create-slide.dto';
import { MobileMode, UpdateSlideDto } from './dto/update-slide.dto';
import { ReorderSlidesDto } from './dto/reorder-slides.dto';
import { LocalStorageProvider, ProcessedMedia } from '../common/storage/local-storage.provider';

export interface RequestMeta { ip?: string; userAgent?: string; actorId?: string | null }

/** حقول المتجر العامة فقط — بلا أي بيانات إدارية أو مسارات فيزيائية. */
const PUBLIC_SELECT = {
  id: true, desktopImageUrl: true, mobileImageUrl: true, altText: true,
  linkUrl: true, title: true, subtitle: true, ctaLabel: true,
} as const;

const ADMIN_SELECT = {
  ...PUBLIC_SELECT, isEnabled: true, sortOrder: true, createdAt: true, updatedAt: true,
} as const;

/** مفاتيح المزوّد المحلي فقط: slider-<uuid>.webp — أي شيء آخر لا يُحذف. */
const MANAGED_KEY_RE = /^\/uploads\/slider\/(slider-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp)$/;
const INTERNAL_ROUTE_RE = /^#\/[^\s]*$/;
const SAFE_HTTP_RE = /^https?:\/\/[^\s]+$/i;
const BLOCKED_SCHEME_RE = /^\s*(javascript|data|file|vbscript|blob):/i;

@Injectable()
export class SliderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: LocalStorageProvider,
  ) {}

  // ------------------------- linkUrl policy -------------------------
  /** يقبل: مسار داخلي (#/...) أو http(s):// — يرفض أي سكيم خطر بلا تطبيع. */
  private normalizeLink(raw?: string | null): string | null | undefined {
    if (raw === undefined) return undefined;
    const value = (raw ?? '').trim();
    if (value === '') return null; // إفراغ صريح
    if (BLOCKED_SCHEME_RE.test(value)) throw new BadRequestException('رابط غير مسموح: سكيم خطر');
    if (INTERNAL_ROUTE_RE.test(value)) return value;
    if (SAFE_HTTP_RE.test(value)) return value;
    throw new BadRequestException('رابط غير صالح: المسموح مسار داخلي (#/...) أو http(s)://');
  }

  private managedKey(url?: string | null): string | null {
    if (!url) return null;
    const m = MANAGED_KEY_RE.exec(url.trim());
    return m ? m[1] : null;
  }

  // ------------------------- public -------------------------
  async listPublic() {
    return this.prisma.sliderSlide.findMany({
      where: { isEnabled: true },
      select: PUBLIC_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  // ------------------------- admin -------------------------
  async listAdmin() {
    return this.prisma.sliderSlide.findMany({ select: ADMIN_SELECT, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
  }

  async findOneAdmin(id: number) {
    const row = await this.prisma.sliderSlide.findUnique({ where: { id }, select: ADMIN_SELECT });
    if (!row) throw new NotFoundException('الشريحة غير موجودة');
    return row;
  }

  private async mustExist(id: number) {
    const row = await this.prisma.sliderSlide.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('الشريحة غير موجودة');
    return row;
  }

  async create(dto: CreateSlideDto, desktop: ProcessedMedia, mobile: ProcessedMedia | null, meta: RequestMeta) {
    try {
      const linkUrl = this.normalizeLink(dto.linkUrl) ?? null;
      const row = await this.prisma.sliderSlide.create({
        data: {
          desktopImageUrl: desktop.url,
          mobileImageUrl: mobile?.url ?? null,
          altText: dto.altText ?? null,
          linkUrl,
          title: dto.title ?? null,
          subtitle: dto.subtitle ?? null,
          ctaLabel: dto.ctaLabel ?? null,
          isEnabled: dto.isEnabled ?? true,
          sortOrder: dto.sortOrder ?? 0,
        },
        select: ADMIN_SELECT,
      });
      await this.audit.log({
        action: AUDIT.SLIDER_CREATED, actorId: meta.actorId ?? null, entity: 'SliderSlide', entityId: String(row.id),
        metadata: { desktopBytes: desktop.bytes, hasMobile: !!mobile, isEnabled: row.isEnabled, sortOrder: row.sortOrder },
        ip: meta.ip, userAgent: meta.userAgent,
      });
      return row;
    } catch (err) {
      // فشل القاعدة ⇒ تنظيف الأصول الجديدة غير المستخدمة، بلا لمس أي شيء قديم.
      await this.storage.remove(desktop.key).catch(() => undefined);
      if (mobile) await this.storage.remove(mobile.key).catch(() => undefined);
      throw err;
    }
  }

  async update(id: number, dto: UpdateSlideDto, desktop: ProcessedMedia | null, mobile: ProcessedMedia | null, meta: RequestMeta) {
    let current;
    try {
      current = await this.mustExist(id);
    } catch (err) {
      // الشريحة غير موجودة: لا نترك الأصول الجديدة يتيمة.
      if (desktop) await this.storage.remove(desktop.key).catch(() => undefined);
      if (mobile) await this.storage.remove(mobile.key).catch(() => undefined);
      throw err;
    }
    const data: Prisma.SliderSlideUpdateInput = {};
    if (dto.altText !== undefined) data.altText = dto.altText;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.subtitle !== undefined) data.subtitle = dto.subtitle;
    if (dto.ctaLabel !== undefined) data.ctaLabel = dto.ctaLabel;
    if (dto.isEnabled !== undefined) data.isEnabled = dto.isEnabled;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    // Desktop: لا يُفرَّغ أبدًا — يُستبدل فقط عند رفع ملف جديد.
    if (desktop) data.desktopImageUrl = desktop.url;

    const mode: MobileMode = dto.mobileMode ?? 'keep';
    if (mode === 'replace') {
      if (!mobile) throw new BadRequestException('mobileMode=replace يتطلب رفع صورة جوال');
      data.mobileImageUrl = mobile.url;
    } else if (mode === 'remove') {
      data.mobileImageUrl = null;
    } else if (mobile) {
      throw new BadRequestException('صورة جوال مرفقة بلا mobileMode=replace');
    }

    const oldDesktop = current.desktopImageUrl;
    const oldMobile = current.mobileImageUrl;

    let row;
    try {
      const link = this.normalizeLink(dto.linkUrl);
      if (link !== undefined) data.linkUrl = link;
      row = await this.prisma.sliderSlide.update({ where: { id }, data, select: ADMIN_SELECT });
    } catch (err) {
      // فشل القاعدة ⇒ حذف الجديد فقط · القديم يبقى سليمًا.
      if (desktop) await this.storage.remove(desktop.key).catch(() => undefined);
      if (mode === 'replace' && mobile) await this.storage.remove(mobile.key).catch(() => undefined);
      throw err;
    }

    // بعد نجاح القاعدة فقط: حذف الأصول القديمة المُدارة (إن تغيّرت).
    const toDelete: string[] = [];
    if (desktop && oldDesktop !== row.desktopImageUrl) {
      const k = this.managedKey(oldDesktop); if (k) toDelete.push(k);
    }
    if (oldMobile !== row.mobileImageUrl) {
      const k = this.managedKey(oldMobile); if (k) toDelete.push(k);
    }
    const cleanupFailures: string[] = [];
    for (const key of toDelete) {
      try { await this.storage.remove(key); } catch (e) { cleanupFailures.push(key + ': ' + (e as Error).message); }
    }

    await this.audit.log({
      action: AUDIT.SLIDER_UPDATED, actorId: meta.actorId ?? null, entity: 'SliderSlide', entityId: String(id),
      metadata: { fields: Object.keys(data), mobileMode: mode, replacedDesktop: !!desktop, cleanupFailures },
      ip: meta.ip, userAgent: meta.userAgent,
    });
    if (dto.isEnabled !== undefined) {
      await this.audit.log({
        action: dto.isEnabled ? AUDIT.SLIDER_ENABLED : AUDIT.SLIDER_DISABLED,
        actorId: meta.actorId ?? null, entity: 'SliderSlide', entityId: String(id), ip: meta.ip, userAgent: meta.userAgent,
      });
    }
    return { ...row, cleanupFailures };
  }

  async remove(id: number, meta: RequestMeta) {
    const current = await this.mustExist(id);
    await this.prisma.sliderSlide.delete({ where: { id } });
    // بعد نجاح حذف القاعدة فقط: تنظيف الأصول المُدارة (بلا إحياء حالة فاسدة عند الفشل).
    const keys = [this.managedKey(current.desktopImageUrl), this.managedKey(current.mobileImageUrl)].filter(Boolean) as string[];
    const cleanupFailures: string[] = [];
    for (const key of keys) {
      try { await this.storage.remove(key); } catch (e) { cleanupFailures.push(key + ': ' + (e as Error).message); }
    }
    await this.audit.log({
      action: AUDIT.SLIDER_DELETED, actorId: meta.actorId ?? null, entity: 'SliderSlide', entityId: String(id),
      metadata: { cleaned: keys.length, cleanupFailures }, ip: meta.ip, userAgent: meta.userAgent,
    });
    return { id, deleted: true, cleanupFailures };
  }

  /** ترتيب دفعي داخل معاملة واحدة — لا حالة نصف مرتّبة عند الفشل. */
  async reorder(dto: ReorderSlidesDto, meta: RequestMeta) {
    const ids = dto.ids ?? [];
    const unique = new Set(ids);
    if (unique.size !== ids.length) throw new BadRequestException('معرّفات مكرّرة في طلب الترتيب');
    const found = await this.prisma.sliderSlide.findMany({ where: { id: { in: ids } }, select: { id: true } });
    if (found.length !== ids.length) {
      const missing = ids.filter((i) => !found.some((f) => f.id === i));
      throw new BadRequestException('معرّفات غير موجودة: ' + missing.join(','));
    }
    await this.prisma.$transaction(
      ids.map((id, index) => this.prisma.sliderSlide.update({ where: { id }, data: { sortOrder: index } })),
    );
    await this.audit.log({
      action: AUDIT.SLIDER_REORDERED, actorId: meta.actorId ?? null, entity: 'SliderSlide',
      metadata: { count: ids.length, order: ids }, ip: meta.ip, userAgent: meta.userAgent,
    });
    return this.listAdmin();
  }
}
