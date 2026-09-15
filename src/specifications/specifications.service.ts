import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { Prisma, SpecificationType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT } from '../audit/audit.actions';
import { CreateSpecificationDefinitionDto } from './dto/create-specification.dto';
import { UpdateSpecificationDefinitionDto } from './dto/update-specification.dto';
import { ListSpecificationsQueryDto } from './dto/list-specifications.query.dto';
import { SetProductSpecificationsDto } from './dto/product-specifications.dto';
import { ActorAccess, hasPermission } from '../common/utils/permissions.util';
import { slugify } from '../common/utils/slug.util';
import { RequestMeta } from '../products/products.service';

const DEFINITION_SELECT = {
  id: true, name: true, key: true, type: true, unit: true, options: true,
  categoryId: true, isActive: true, sortOrder: true, createdAt: true, updatedAt: true,
  category: { select: { id: true, name: true, slug: true } },
  _count: { select: { values: true } },
} as const;

@Injectable()
export class SpecificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private serialize(row: Record<string, unknown>) {
    const { _count, ...rest } = row as { _count?: { values: number } } & Record<string, unknown>;
    return { ...rest, productsCount: _count?.values ?? 0 };
  }

  /* --------------------------- definitions CRUD --------------------------- */

  async list(query: ListSpecificationsQueryDto, actor?: ActorAccess | null) {
    const { page, limit, search, type, categoryId, includeInactive } = query;
    const showInactive = !!includeInactive && !!actor && hasPermission(actor, 'specifications.read');

    const where: Prisma.SpecificationDefinitionWhereInput = {};
    if (!showInactive) where.isActive = true;
    if (type) where.type = type as SpecificationType;
    if (categoryId) where.categoryId = categoryId;
    if (search?.trim()) {
      const term = search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { key: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.specificationDefinition.count({ where }),
      this.prisma.specificationDefinition.findMany({
        where,
        select: DEFINITION_SELECT,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: rows.map((r) => this.serialize(r as never)),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async findOne(id: number) {
    const row = await this.prisma.specificationDefinition.findUnique({
      where: { id }, select: DEFINITION_SELECT,
    });
    if (!row) throw new NotFoundException('المواصفة غير موجودة');
    return this.serialize(row as never);
  }

  async create(dto: CreateSpecificationDefinitionDto, actor: ActorAccess, meta: RequestMeta = {}) {
    const key = (dto.key ? slugify(dto.key) : slugify(dto.name)).replace(/-/g, '_');
    const clash = await this.prisma.specificationDefinition.findUnique({ where: { key }, select: { id: true } });
    if (clash) throw new ConflictException('مفتاح المواصفة مستخدم مسبقاً');

    this.assertTypeOptions(dto.type, dto.options, dto.unit);
    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId }, select: { id: true } });
      if (!category) throw new BadRequestException('التصنيف غير موجود');
    }

    const created = await this.prisma.specificationDefinition.create({
      data: {
        name: dto.name.trim(),
        key,
        type: dto.type,
        unit: dto.unit ?? null,
        options: dto.options ?? [],
        categoryId: dto.categoryId ?? null,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
      select: DEFINITION_SELECT,
    });

    await this.audit.log({
      action: AUDIT.SPECIFICATION_CREATED,
      actorId: actor.id, entity: 'specification', entityId: String(created.id),
      metadata: { key, type: dto.type, unit: dto.unit ?? null }, ...meta,
    });
    return this.serialize(created as never);
  }

  private assertTypeOptions(type: SpecificationType, options?: string[], unit?: string | null) {
    if (type === 'SELECT' && (!options || options.length < 2)) {
      throw new BadRequestException('مواصفة SELECT تتطلب قائmة options (عنصران على الأقل)');
    }
    if (type !== 'SELECT' && options?.length) {
      throw new BadRequestException('options مسموحة فقط للمواصفات من نوع SELECT');
    }
    if (type !== 'NUMBER' && unit) {
      throw new BadRequestException('unit مسموحة فقط للمواصفات الرقمية (NUMBER)');
    }
  }

  async update(id: number, dto: UpdateSpecificationDefinitionDto, actor: ActorAccess, meta: RequestMeta = {}) {
    const current = await this.prisma.specificationDefinition.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('المواصفة غير موجودة');

    // A type change invalidates existing values, so it is refused for used specs.
    if (dto.type !== undefined && dto.type !== current.type) {
      const valuesCount = await this.prisma.productSpecification.count({ where: { specificationId: id } });
      if (valuesCount > 0) {
        throw new ConflictException('لا يمكن تغيير نوع مواصفة مستخدمة في منتجات — أنشئ مواصفة جديدة');
      }
    }

    const nextType = dto.type ?? current.type;
    // Switching away from NUMBER/SELECT drops unit/options that no longer apply.
    const nextOptions = nextType === 'SELECT' ? (dto.options ?? current.options) : [];
    const nextUnit = nextType === 'NUMBER' ? (dto.unit !== undefined ? dto.unit : current.unit) : null;
    this.assertTypeOptions(nextType, nextOptions, nextUnit);

    const data: Prisma.SpecificationDefinitionUpdateInput = {};
    const changed: string[] = [];
    if (dto.name !== undefined) { data.name = dto.name.trim(); changed.push('name'); }
    if (dto.type !== undefined) {
      data.type = dto.type;
      data.options = nextOptions;
      data.unit = nextUnit;
      changed.push('type');
    }
    if (dto.options !== undefined && dto.type === undefined) { data.options = dto.options; changed.push('options'); }
    if (dto.isActive !== undefined) { data.isActive = dto.isActive; changed.push('isActive'); }
    if (dto.sortOrder !== undefined) { data.sortOrder = dto.sortOrder; changed.push('sortOrder'); }
    if (dto.unit !== undefined && dto.type === undefined) {
      data.unit = dto.unit;
      changed.push('unit');
    }
    if (dto.categoryId !== undefined) {
      if (dto.categoryId === null) data.category = { disconnect: true };
      else data.category = { connect: { id: dto.categoryId } };
      changed.push('categoryId');
    }
    if (!changed.length) throw new BadRequestException('لا توجد حقول قابلة للتعديل');

    const updated = await this.prisma.specificationDefinition.update({
      where: { id }, data, select: DEFINITION_SELECT,
    });
    await this.audit.log({
      action: AUDIT.SPECIFICATION_UPDATED,
      actorId: actor.id, entity: 'specification', entityId: String(id),
      metadata: { changed }, ...meta,
    });
    return this.serialize(updated as never);
  }

  /** Soft delete by default; hard delete only when no product uses the definition. */
  async remove(id: number, actor: ActorAccess, hard = false, meta: RequestMeta = {}) {
    const definition = await this.prisma.specificationDefinition.findUnique({
      where: { id },
      select: { id: true, key: true, _count: { select: { values: true } } },
    });
    if (!definition) throw new NotFoundException('المواصفة غير موجودة');

    if (hard) {
      if (definition._count.values > 0) {
        throw new ConflictException('لا يمكن الحذف النهائي — المواصفة مستخدمة في منتجات');
      }
      await this.prisma.specificationDefinition.delete({ where: { id } });
      await this.audit.log({
        action: AUDIT.SPECIFICATION_DELETED,
        actorId: actor.id, entity: 'specification', entityId: String(id),
        metadata: { key: definition.key, hard: true }, ...meta,
      });
      return { deleted: true, hard: true, id };
    }

    const updated = await this.prisma.specificationDefinition.update({
      where: { id }, data: { isActive: false }, select: DEFINITION_SELECT,
    });
    await this.audit.log({
      action: AUDIT.SPECIFICATION_DELETED,
      actorId: actor.id, entity: 'specification', entityId: String(id),
      metadata: { key: definition.key, soft: true }, ...meta,
    });
    return { deleted: false, softDeleted: true, specification: this.serialize(updated as never) };
  }

  /* --------------------------- product ↔ specs --------------------------- */

  async listForProduct(productId: number) {
    await this.assertProduct(productId);
    const rows = await this.prisma.productSpecification.findMany({
      where: { productId },
      select: {
        id: true, value: true,
        specification: { select: { id: true, key: true, name: true, type: true, unit: true, options: true } },
      },
      orderBy: { specification: { sortOrder: 'asc' } },
    });
    return rows.map((row) => ({
      id: row.id,
      specificationId: row.specification.id,
      key: row.specification.key,
      name: row.specification.name,
      type: row.specification.type,
      unit: row.specification.unit,
      options: row.specification.options,
      value: row.value,
      displayValue: row.specification.unit ? `${row.value} ${row.specification.unit}` : row.value,
    }));
  }

  private async assertProduct(productId: number) {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) throw new NotFoundException('المنتج غير موجود');
  }

  /** Replaces the product's specification set atomically and validates each value by type. */
  async replaceForProduct(productId: number, dto: SetProductSpecificationsDto, actor: ActorAccess, meta: RequestMeta = {}) {
    await this.assertProduct(productId);

    const ids = dto.specifications.map((s) => s.specificationId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('لا يمكن تكرار نفس المواصفة في الطلب');
    }

    const definitions = ids.length
      ? await this.prisma.specificationDefinition.findMany({ where: { id: { in: ids } } })
      : [];
    if (definitions.length !== ids.length) {
      throw new BadRequestException('بعض المواصفات غير موجودة');
    }
    const byId = new Map(definitions.map((d) => [d.id, d]));

    const rows = dto.specifications.map((item) => {
      const definition = byId.get(item.specificationId)!;
      return {
        productId,
        specificationId: item.specificationId,
        value: this.normalizeValue(definition.type, definition.options, item.value, definition.name),
      };
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.productSpecification.deleteMany({ where: { productId } });
      if (rows.length) await tx.productSpecification.createMany({ data: rows });
    });

    await this.audit.log({
      action: AUDIT.PRODUCT_SPECIFICATIONS_UPDATED,
      actorId: actor.id, entity: 'product', entityId: String(productId),
      metadata: { count: rows.length, specifications: ids }, ...meta,
    });

    return this.listForProduct(productId);
  }

  private normalizeValue(
    type: SpecificationType,
    options: string[],
    raw: string,
    name: string,
  ): string {
    const value = `${raw}`.trim();
    if (!value) throw new BadRequestException(`القيمة مطلوبة للمواصفة «${name}»`);

    switch (type) {
      case 'NUMBER': {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
          throw new BadRequestException(`المواصفة «${name}» تتطلب قيمة رقمية`);
        }
        if (numeric < 0) throw new BadRequestException(`المواصفة «${name}» لا تقبل قيمة سالبة`);
        return String(numeric);
      }
      case 'BOOLEAN': {
        const lowered = value.toLowerCase();
        if (['true', '1', 'yes', 'نعم'].includes(lowered)) return 'true';
        if (['false', '0', 'no', 'لا'].includes(lowered)) return 'false';
        throw new BadRequestException(`المواصفة «${name}» تتطلب قيمة منطقية (true/false)`);
      }
      case 'SELECT': {
        if (options.length && !options.includes(value)) {
          throw new BadRequestException(
            `القيمة «${value}» غير مسموحة للمواصفة «${name}» — المسموح: ${options.join(', ')}`,
          );
        }
        return value;
      }
      default:
        return value.slice(0, 500);
    }
  }
}
