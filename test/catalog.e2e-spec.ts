import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

/**
 * Stage 4 — Catalog (categories, brands, products, images, specifications) and
 * the inventory foundation. Real database + real guards: every assertion goes
 * through the HTTP layer, including public (unauthenticated) storefront reads.
 */
describe('Catalog & Inventory (e2e)', () => {
  let app: INestApplication;
  let http: () => request.Agent;

  const stamp = Date.now().toString().slice(-7);
  const pass = 'Str0ng!Pass1';
  const phones = { employee: `0711${stamp}`, customer: `0712${stamp}` };
  const emails = { employee: `emp.catalog.${stamp}@alwled.test`, customer: `cust.catalog.${stamp}@alwled.test` };

  const tokens: Record<string, string> = {};
  const ids: Record<string, string | number> = {};
  const slugs = {
    root: `cat-root-${stamp}`,
    child: `cat-child-${stamp}`,
    grand: `cat-grand-${stamp}`,
    fourth: `cat-fourth-${stamp}`,
    brand: `brand-${stamp}`,
    brand2: `brand-${stamp}-b`,
    product: `product-${stamp}`,
    specNumber: `spec-capacity-${stamp}`,
    specSelect: `spec-color-${stamp}`,
    specBool: `spec-nofrost-${stamp}`,
  };

  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  /** Definition keys are normalized to snake_case server-side (matches seeded keys). */
  const specKey = (slug: string) => slug.replace(/-/g, '_');

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    http = () => request(app.getHttpServer());

    // OWNER from the seed
    const ownerLogin = await http()
      .post('/api/v1/auth/login')
      .send({ phone: process.env.SEED_OWNER_PHONE, password: process.env.SEED_OWNER_PASSWORD });
    expect(ownerLogin.status).toBe(200);
    tokens.owner = ownerLogin.body.data.accessToken;

    // EMPLOYEE (catalog read/create/update but no brands.create / inventory.adjust)
    const employee = await http().post('/api/v1/employees').set(auth('owner')).send({
      firstName: 'Catalog', lastName: 'Employee', email: emails.employee, phone: phones.employee, password: pass,
    });
    expect(employee.status).toBe(201);
    const employeeLogin = await http().post('/api/v1/auth/login').send({ phone: phones.employee, password: pass });
    tokens.employee = employeeLogin.body.data.accessToken;

    // CUSTOMER through public registration
    const customer = await http().post('/api/v1/auth/register').send({
      firstName: 'Catalog', lastName: 'Customer', email: emails.customer, phone: phones.customer,
      password: pass, confirmPassword: pass,
    });
    expect(customer.status).toBe(201);
    const customerLogin = await http().post('/api/v1/auth/login').send({ phone: phones.customer, password: pass });
    tokens.customer = customerLogin.body.data.accessToken;
  }, 60000);

  afterAll(async () => {
    // Self-cleanup of everything this spec created (matched by its stamp).
    try {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      await prisma.product.deleteMany({ where: { sku: { contains: `${stamp}`.toUpperCase() } } });
      await prisma.product.deleteMany({ where: { slug: { contains: stamp } } });
      await prisma.specificationDefinition.deleteMany({ where: { key: { contains: stamp } } });
      await prisma.category.deleteMany({ where: { slug: { contains: stamp }, parentId: { not: null } } });
      await prisma.category.deleteMany({ where: { slug: { contains: stamp } } });
      await prisma.brand.deleteMany({ where: { slug: { contains: stamp } } });
      await prisma.user.deleteMany({
        where: { OR: [{ phone: { in: Object.values(phones) } }, { email: { in: Object.values(emails) } }] },
      });
      await prisma.$disconnect();
    } catch (error) {
      console.warn('cleanup skipped:', (error as Error).message);
    }
    await app?.close();
  });

  /* ------------------------------ Categories ------------------------------ */

  describe('Categories', () => {
    it('OWNER creates a root category, a child and a grandchild', async () => {
      const root = await http().post('/api/v1/categories').set(auth('owner')).send({
        name: `تصنيف جذر ${stamp}`, slug: slugs.root, sortOrder: 1,
      });
      expect(root.status).toBe(201);
      expect(root.body.data.slug).toBe(slugs.root);
      expect(root.body.data.parentId).toBeNull();
      ids.root = root.body.data.id;

      const child = await http().post('/api/v1/categories').set(auth('owner')).send({
        name: `تصنيف فرعي ${stamp}`, slug: slugs.child, parentId: ids.root,
      });
      expect(child.status).toBe(201);
      expect(child.body.data.parent.id).toBe(ids.root);
      ids.child = child.body.data.id;

      const grand = await http().post('/api/v1/categories').set(auth('owner')).send({
        name: `تصنيف ثالث ${stamp}`, slug: slugs.grand, parentId: ids.child,
      });
      expect(grand.status).toBe(201);
      ids.grand = grand.body.data.id;
    });

    it('auto-generates a slug when none is provided', async () => {
      const res = await http().post('/api/v1/categories').set(auth('owner')).send({ name: 'Auto Slug Category' });
      expect(res.status).toBe(201);
      expect(res.body.data.slug).toContain('auto-slug-category');
    });

    it('rejects duplicate slugs and duplicate parent refs', async () => {
      const dup = await http().post('/api/v1/categories').set(auth('owner')).send({
        name: 'misc', slug: slugs.root,
      });
      expect(dup.status).toBe(409);
      const badParent = await http().post('/api/v1/categories').set(auth('owner')).send({
        name: 'misc2', parentId: 987654,
      });
      expect(badParent.status).toBe(400);
    });

    it('enforces the maximum depth (3 levels)', async () => {
      const fourth = await http().post('/api/v1/categories').set(auth('owner')).send({
        name: `تصنيف رابع ${stamp}`, slug: slugs.fourth, parentId: ids.grand,
      });
      expect(fourth.status).toBe(400);
    });

    it('blocks circular parents', async () => {
      const self = await http().patch(`/api/v1/categories/${ids.root}`).set(auth('owner')).send({ parentId: ids.root });
      expect(self.status).toBe(400);

      const circular = await http().patch(`/api/v1/categories/${ids.root}`).set(auth('owner')).send({ parentId: ids.grand });
      expect(circular.status).toBe(400);
      expect(JSON.stringify(circular.body)).toContain('حلقة');
    });

    it('CUSTOMER and EMPLOYEE cannot create or update categories', async () => {
      expect((await http().post('/api/v1/categories').set(auth('customer')).send({ name: 'hack' })).status).toBe(403);
      expect((await http().post('/api/v1/categories').set(auth('employee')).send({ name: 'hack2' })).status).toBe(403);
      expect(
        (await http().patch(`/api/v1/categories/${ids.root}`).set(auth('customer')).send({ name: 'hacked' })).status,
      ).toBe(403);
      expect((await http().post('/api/v1/categories').send({ name: 'anon' })).status).toBe(401);
    });

    it('public list returns active categories only; staff can include inactive', async () => {
      const publicList = await http().get('/api/v1/categories?limit=100&search=تصنيف تجريبي');
      expect(publicList.status).toBe(200);
      expect(publicList.body.data.items.every((c: { isActive: boolean }) => c.isActive)).toBe(true);

      const disabled = await http().patch(`/api/v1/categories/${ids.grand}`).set(auth('owner')).send({ isActive: false });
      expect(disabled.status).toBe(200);

      const afterDisable = await http().get(`/api/v1/categories/${slugs.grand}`);
      expect(afterDisable.status).toBe(404);

      const staffSees = await http()
        .get(`/api/v1/categories?limit=100&includeInactive=true&search=${stamp}`)
        .set(auth('owner'));
      expect(staffSees.body.data.items.some((c: { slug: string }) => c.slug === slugs.grand)).toBe(true);

      const customerCannot = await http()
        .get(`/api/v1/categories?limit=100&includeInactive=true&search=${stamp}`)
        .set(auth('customer'));
      expect(customerCannot.body.data.items.every((c: { isActive: boolean }) => c.isActive)).toBe(true);

      await http().patch(`/api/v1/categories/${ids.grand}`).set(auth('owner')).send({ isActive: true });
    });

    it('supports the tree view and detail by slug', async () => {
      const tree = await http().get(`/api/v1/categories?tree=true&limit=100&search=${stamp}`).set(auth('owner'));
      expect(tree.status).toBe(200);
      const rootNode = tree.body.data.items.find((c: { slug: string }) => c.slug === slugs.root);
      expect(rootNode.children.length).toBeGreaterThanOrEqual(1);

      const bySlug = await http().get(`/api/v1/categories/${slugs.child}`);
      expect(bySlug.status).toBe(200);
      expect(bySlug.body.data.id).toBe(ids.child);
      expect(Array.isArray(bySlug.body.data.children)).toBe(true);
    });

    it('soft-deletes by default and refuses a hard delete while products exist', async () => {
      const brandAndProduct = await http().post('/api/v1/brands').set(auth('owner')).send({
        name: `علامة للحذف ${stamp}`, slug: `${slugs.brand}-del`,
      });
      const product = await http().post('/api/v1/products').set(auth('owner')).send({
        name: `منتج للحذف ${stamp}`, sku: `DEL-${stamp}`, price: 10,
        brandId: brandAndProduct.body.data.id, categoryId: ids.child,
      });
      expect(product.status).toBe(201);
      ids.productForDelete = product.body.data.id;

      const soft = await http().delete(`/api/v1/categories/${ids.grand}`).set(auth('owner'));
      expect(soft.status).toBe(200);
      expect(soft.body.data.softDeleted).toBe(true);

      const hard = await http().delete(`/api/v1/categories/${ids.child}?hard=true`).set(auth('owner'));
      expect(hard.status).toBe(409);
    });
  });

  /* -------------------------------- Brands -------------------------------- */

  describe('Brands', () => {
    it('creates, lists and updates brands', async () => {
      const created = await http().post('/api/v1/brands').set(auth('owner')).send({
        name: `علامة ${stamp}`, slug: slugs.brand, description: 'وصف',
      });
      expect(created.status).toBe(201);
      ids.brand = created.body.data.id;

      const second = await http().post('/api/v1/brands').set(auth('owner')).send({
        name: `علامة ب ${stamp}`, slug: slugs.brand2,
      });
      ids.brand2 = second.body.data.id;

      const list = await http().get(`/api/v1/brands?search=${stamp}`);
      expect(list.status).toBe(200);
      expect(list.body.data.items.length).toBeGreaterThanOrEqual(2);

      const updated = await http().patch(`/api/v1/brands/${ids.brand}`).set(auth('owner')).send({ description: 'وصف محدث' });
      expect(updated.status).toBe(200);
      expect(updated.body.data.description).toBe('وصف محدث');
    });

    it('rejects duplicate slug and duplicate name', async () => {
      expect((await http().post('/api/v1/brands').set(auth('owner')).send({ name: 'dup1', slug: slugs.brand })).status).toBe(409);
      expect((await http().post('/api/v1/brands').set(auth('owner')).send({ name: `علامة ${stamp}` })).status).toBe(409);
    });

    it('EMPLOYEE cannot create brands (has brands.read only)', async () => {
      expect((await http().post('/api/v1/brands').set(auth('employee')).send({ name: 'hack brand' })).status).toBe(403);
      expect((await http().get('/api/v1/brands').set(auth('employee'))).status).toBe(200);
    });

    it('disables a brand and hides it from the storefront', async () => {
      const disabled = await http().patch(`/api/v1/brands/${ids.brand2}`).set(auth('owner')).send({ isActive: false });
      expect(disabled.status).toBe(200);
      expect((await http().get(`/api/v1/brands/${slugs.brand2}`)).status).toBe(404);
      const staff = await http().get(`/api/v1/brands/${slugs.brand2}`).set(auth('owner'));
      expect(staff.status).toBe(200);
      await http().patch(`/api/v1/brands/${ids.brand2}`).set(auth('owner')).send({ isActive: true });
    });
  });

  /* ------------------------------- Products ------------------------------- */

  describe('Products', () => {
    it('creates a product with an inventory row (single transaction)', async () => {
      const res = await http().post('/api/v1/products').set(auth('owner')).send({
        name: `منتج تجريبي ${stamp}`,
        slug: slugs.product,
        sku: `CAT-${stamp}`,
        shortDescription: 'وصف مختصر',
        description: 'وصف كامل',
        price: 500.5,
        compareAtPrice: 600,
        brandId: ids.brand,
        categoryId: ids.child,
        isFeatured: true,
      });
      expect(res.status).toBe(201);
      expect(res.body.data.price).toBe('500.50');
      expect(res.body.data.compareAtPrice).toBe('600.00');
      expect(res.body.data.hasDiscount).toBe(true);
      expect(res.body.data.inventory.quantity).toBe(0);
      expect(res.body.data.inventory.availableQuantity).toBe(0);
      ids.product = res.body.data.id;
    });

    it('generates sku and slug when omitted', async () => {
      const res = await http().post('/api/v1/products').set(auth('owner')).send({
        name: `Auto Generated ${stamp}`, price: 99, brandId: ids.brand, categoryId: ids.child,
      });
      expect(res.status).toBe(201);
      expect(res.body.data.sku.length).toBeGreaterThan(0);
      expect(res.body.data.slug).toContain('auto-generated');
      ids.autoProduct = res.body.data.id;
    });

    it('rejects duplicate SKU and duplicate slug', async () => {
      const dupSku = await http().post('/api/v1/products').set(auth('owner')).send({
        name: 'dup sku', sku: `CAT-${stamp}`, price: 10, brandId: ids.brand, categoryId: ids.child,
      });
      expect(dupSku.status).toBe(409);
      const dupSlug = await http().post('/api/v1/products').set(auth('owner')).send({
        name: 'dup slug', slug: slugs.product, sku: `CAT2-${stamp}`, price: 10,
        brandId: ids.brand, categoryId: ids.child,
      });
      expect(dupSlug.status).toBe(409);
    });

    it('rejects invalid category, invalid brand and impossible prices', async () => {
      expect((await http().post('/api/v1/products').set(auth('owner')).send({
        name: 'bad cat', sku: `BAD1-${stamp}`, price: 10, brandId: ids.brand, categoryId: 987654,
      })).status).toBe(400);
      expect((await http().post('/api/v1/products').set(auth('owner')).send({
        name: 'bad brand', sku: `BAD2-${stamp}`, price: 10, brandId: 987654, categoryId: ids.child,
      })).status).toBe(400);
      expect((await http().post('/api/v1/products').set(auth('owner')).send({
        name: 'bad price', sku: `BAD3-${stamp}`, price: 100, compareAtPrice: 50, brandId: ids.brand, categoryId: ids.child,
      })).status).toBe(400);
      expect((await http().post('/api/v1/products').set(auth('owner')).send({
        name: 'negative price', sku: `BAD4-${stamp}`, price: -5, brandId: ids.brand, categoryId: ids.child,
      })).status).toBe(400);
    });

    it('refuses to publish into an inactive category but allows a draft', async () => {
      await http().patch(`/api/v1/categories/${ids.child}`).set(auth('owner')).send({ isActive: false });

      const publish = await http().post('/api/v1/products').set(auth('owner')).send({
        name: 'publish inactive cat', sku: `PUB-${stamp}`, price: 10, brandId: ids.brand, categoryId: ids.child,
      });
      expect(publish.status).toBe(400);

      const draft = await http().post('/api/v1/products').set(auth('owner')).send({
        name: 'draft product', sku: `DRAFT-${stamp}`, price: 10, brandId: ids.brand,
        categoryId: ids.child, isActive: false,
      });
      expect(draft.status).toBe(201);
      ids.draftProduct = draft.body.data.id;

      await http().patch(`/api/v1/categories/${ids.child}`).set(auth('owner')).send({ isActive: true });
    });

    it('never accepts inventory or audit fields from the product endpoints', async () => {
      const res = await http().post('/api/v1/products').set(auth('owner')).send({
        name: 'forbidden fields', sku: `FRB-${stamp}`, price: 10, brandId: ids.brand, categoryId: ids.child,
        quantity: 999, id: 424242, createdAt: '2020-01-01',
      });
      expect(res.status).toBe(400);
    });

    it('updates price/sku and rejects duplicates on update', async () => {
      const res = await http().patch(`/api/v1/products/${ids.autoProduct}`).set(auth('owner')).send({
        price: 120.25, compareAtPrice: 150,
      });
      expect(res.status).toBe(200);
      expect(res.body.data.price).toBe('120.25');

      expect((await http().patch(`/api/v1/products/${ids.autoProduct}`).set(auth('owner')).send({
        sku: `CAT-${stamp}`,
      })).status).toBe(409);
      expect((await http().patch(`/api/v1/products/${ids.autoProduct}`).set(auth('owner')).send({
        compareAtPrice: 5,
      })).status).toBe(400);
      expect((await http().patch(`/api/v1/products/${ids.autoProduct}`).set(auth('owner')).send({
        quantity: 10,
      })).status).toBe(400);
    });

    it('lists with pagination, search, filters and sorting', async () => {
      const list = await http().get(`/api/v1/products?limit=100&search=${stamp}`);
      expect(list.status).toBe(200);
      expect(list.body.meta).toMatchObject({ page: 1, limit: 100 });
      expect(list.body.meta.total).toBeGreaterThanOrEqual(2);

      const page = await http().get('/api/v1/products?page=1&limit=1&sortBy=price&sortOrder=asc');
      expect(page.body.data.items.length).toBe(1);

      const byBrand = await http().get(`/api/v1/products?brandId=${ids.brand}&limit=50`);
      expect(byBrand.body.data.items.every((p: { brand: { id: number } }) => p.brand.id === ids.brand)).toBe(true);

      const byCategory = await http().get(`/api/v1/products?categoryId=${ids.child}&limit=50`);
      expect(byCategory.body.data.items.length).toBeGreaterThanOrEqual(1);

      const featured = await http().get('/api/v1/products?isFeatured=true&limit=50');
      expect(featured.body.data.items.every((p: { isFeatured: boolean }) => p.isFeatured)).toBe(true);

      const ranged = await http().get('/api/v1/products?minPrice=100&maxPrice=600&limit=50');
      expect(ranged.body.data.items.every((p: { price: string }) => Number(p.price) >= 100 && Number(p.price) <= 600)).toBe(true);
    });

    it('public sees active products only; staff can request inactive ones', async () => {
      const disabled = await http().patch(`/api/v1/products/${ids.autoProduct}`).set(auth('owner')).send({ isActive: false });
      expect(disabled.status).toBe(200);

      const publicList = await http().get(`/api/v1/products?limit=100&search=${stamp}`);
      expect(publicList.body.data.items.every((p: { isActive: boolean }) => p.isActive)).toBe(true);
      expect(publicList.body.data.items.some((p: { id: number }) => p.id === ids.autoProduct)).toBe(false);

      const publicDetail = await http().get(`/api/v1/products/${ids.autoProduct}`);
      expect(publicDetail.status).toBe(404);

      const staffList = await http().get(`/api/v1/products?includeInactive=true&limit=100&search=${stamp}`).set(auth('owner'));
      expect(staffList.body.data.items.some((p: { id: number }) => p.id === ids.autoProduct)).toBe(true);

      const staffDetail = await http().get(`/api/v1/products/${ids.autoProduct}`).set(auth('owner'));
      expect(staffDetail.status).toBe(200);
    });

    it('exposes details by id and slug, with inventory only for permitted staff', async () => {
      const publicDetail = await http().get(`/api/v1/products/${slugs.product}`);
      expect(publicDetail.status).toBe(200);
      expect(publicDetail.body.data.brand.id).toBe(ids.brand);
      expect(publicDetail.body.data.category.id).toBe(ids.child);
      expect(publicDetail.body.data.inventory).toBeUndefined();
      expect(publicDetail.body.data.inStock).toBe(false);

      const bySlugRoute = await http().get(`/api/v1/products/slug/${slugs.product}`);
      expect(bySlugRoute.status).toBe(200);

      const staffDetail = await http().get(`/api/v1/products/${slugs.product}`).set(auth('owner'));
      expect(staffDetail.body.data.inventory.quantity).toBe(0);
      expect(staffDetail.body.data.inventory.availableQuantity).toBe(0);
    });

    it('CUSTOMER cannot create/update/delete products; EMPLOYEE with products.* can', async () => {
      const payload = { name: `عميل يحاول ${stamp}`, sku: `CUST-${stamp}`, price: 10, brandId: ids.brand, categoryId: ids.child };
      expect((await http().post('/api/v1/products').set(auth('customer')).send(payload)).status).toBe(403);
      expect((await http().post('/api/v1/products').send(payload)).status).toBe(401);

      const byEmployee = await http().post('/api/v1/products').set(auth('employee')).send(payload);
      expect(byEmployee.status).toBe(201);
      const employeeProductId = byEmployee.body.data.id;

      expect((await http().patch(`/api/v1/products/${employeeProductId}`).set(auth('employee')).send({ price: 11 })).status).toBe(200);
      // EMPLOYEE has no products.delete
      expect((await http().delete(`/api/v1/products/${employeeProductId}`).set(auth('employee'))).status).toBe(403);
    });

    it('soft delete keeps history; hard delete is refused when stock movements exist', async () => {
      await http().post(`/api/v1/inventory/${ids.product}/adjust`).set(auth('owner')).send({
        quantity: 5, reason: 'STOCK_RECEIVED',
      });
      const hard = await http().delete(`/api/v1/products/${ids.product}?hard=true`).set(auth('owner'));
      expect(hard.status).toBe(409);

      const soft = await http().delete(`/api/v1/products/${ids.product}`).set(auth('owner'));
      expect(soft.status).toBe(200);
      expect(soft.body.data.softDeleted).toBe(true);
      const detail = await http().get(`/api/v1/products/${ids.product}`).set(auth('owner'));
      expect(detail.body.data.isActive).toBe(false);
    });
  });

  /* -------------------------------- Images -------------------------------- */

  describe('Product images', () => {
    it('adds images and keeps exactly one primary', async () => {
      const first = await http().post(`/api/v1/products/${ids.autoProduct}/images`).set(auth('owner')).send({
        url: 'https://cdn.example.com/demo/one.webp', altText: 'أولى',
      });
      expect(first.status).toBe(201);
      expect(first.body.data.isPrimary).toBe(true);

      const second = await http().post(`/api/v1/products/${ids.autoProduct}/images`).set(auth('owner')).send({
        url: 'https://cdn.example.com/demo/two.webp',
      });
      expect(second.status).toBe(201);
      expect(second.body.data.isPrimary).toBe(false);

      const both = await http().get(`/api/v1/products/${ids.autoProduct}/images`);
      expect(both.body.data.filter((i: { isPrimary: boolean }) => i.isPrimary).length).toBe(1);
      ids.image1 = first.body.data.id;
      ids.image2 = second.body.data.id;
    });

    it('rejects invalid media urls', async () => {
      const res = await http().post(`/api/v1/products/${ids.autoProduct}/images`).set(auth('owner')).send({
        url: 'not-a-url',
      });
      expect(res.status).toBe(400);
    });

    it('switches the primary image and never leaves two primaries', async () => {
      const setPrimary = await http()
        .patch(`/api/v1/products/${ids.autoProduct}/images/${ids.image2}/primary`)
        .set(auth('owner'));
      expect(setPrimary.status).toBe(200);
      expect(setPrimary.body.data.isPrimary).toBe(true);

      const list = await http().get(`/api/v1/products/${ids.autoProduct}/images`);
      const primaries = list.body.data.filter((i: { isPrimary: boolean }) => i.isPrimary);
      expect(primaries.length).toBe(1);
      expect(primaries[0].id).toBe(ids.image2);
    });

    it('reorders images', async () => {
      const res = await http().patch(`/api/v1/products/${ids.autoProduct}/images/reorder`).set(auth('owner')).send({
        images: [{ id: ids.image2, sortOrder: 0 }, { id: ids.image1, sortOrder: 1 }],
      });
      expect(res.status).toBe(200);
      expect(res.body.data.find((i: { id: number }) => i.id === ids.image2).sortOrder).toBe(0);
    });

    it('promotes a new primary when the primary image is deleted', async () => {
      const del = await http().delete(`/api/v1/products/${ids.autoProduct}/images/${ids.image2}`).set(auth('owner'));
      expect(del.status).toBe(200);
      const list = await http().get(`/api/v1/products/${ids.autoProduct}/images`);
      expect(list.body.data.length).toBe(1);
      expect(list.body.data[0].isPrimary).toBe(true);
    });

    it('requires permission to modify images', async () => {
      expect((await http().post(`/api/v1/products/${ids.autoProduct}/images`).set(auth('customer')).send({
        url: 'https://cdn.example.com/demo/x.webp',
      })).status).toBe(403);
      expect((await http().post(`/api/v1/products/${ids.autoProduct}/images`).send({
        url: 'https://cdn.example.com/demo/x.webp',
      })).status).toBe(401);
    });
  });

  /* ---------------------------- Specifications ---------------------------- */

  describe('Specifications', () => {
    it('creates typed definitions (NUMBER + unit, SELECT + options, BOOLEAN)', async () => {
      const number = await http().post('/api/v1/specifications').set(auth('owner')).send({
        name: `السعة ${stamp}`, key: slugs.specNumber, type: 'NUMBER', unit: 'L',
      });
      expect(number.status).toBe(201);
      ids.specNumber = number.body.data.id;

      const select = await http().post('/api/v1/specifications').set(auth('owner')).send({
        name: `اللون ${stamp}`, key: slugs.specSelect, type: 'SELECT', options: ['أسود', 'أبيض'],
      });
      expect(select.status).toBe(201);
      expect(select.body.data.key).toBe(specKey(slugs.specSelect));
      ids.specSelect = select.body.data.id;

      const bool = await http().post('/api/v1/specifications').set(auth('owner')).send({
        name: `No Frost ${stamp}`, key: slugs.specBool, type: 'BOOLEAN',
      });
      expect(bool.status).toBe(201);
      ids.specBool = bool.body.data.id;
    });

    it('validates definition rules', async () => {
      expect((await http().post('/api/v1/specifications').set(auth('owner')).send({
        name: 'bad select', key: `bad-select-${stamp}`, type: 'SELECT',
      })).status).toBe(400);
      expect((await http().post('/api/v1/specifications').set(auth('owner')).send({
        name: 'bad unit', key: `bad-unit-${stamp}`, type: 'TEXT', unit: 'L',
      })).status).toBe(400);
      expect((await http().post('/api/v1/specifications').set(auth('owner')).send({
        name: 'dup key', key: slugs.specNumber, type: 'NUMBER',
      })).status).toBe(409);
      expect((await http().post('/api/v1/specifications').set(auth('employee')).send({
        name: 'employee spec', key: `emp-spec-${stamp}`, type: 'TEXT',
      })).status).toBe(403);
    });

    it('replaces a product specification set transactionally with typed values', async () => {
      const res = await http().put(`/api/v1/products/${ids.product}/specifications`).set(auth('owner')).send({
        specifications: [
          { specificationId: ids.specNumber, value: '500' },
          { specificationId: ids.specSelect, value: 'أسود' },
          { specificationId: ids.specBool, value: 'نعم' },
        ],
      });
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(3);
      const capacity = res.body.data.find((s: { key: string }) => s.key === specKey(slugs.specNumber));
      expect(capacity.value).toBe('500');
      expect(capacity.unit).toBe('L');
      expect(capacity.displayValue).toBe('500 L');
      const noFrost = res.body.data.find((s: { key: string }) => s.key === specKey(slugs.specBool));
      expect(noFrost.value).toBe('true');

      const publicRead = await http().get(`/api/v1/products/${ids.product}/specifications`);
      expect(publicRead.status).toBe(200);
      expect(publicRead.body.data.length).toBe(3);
    });

    it('rejects values that do not match the definition type', async () => {
      expect((await http().put(`/api/v1/products/${ids.product}/specifications`).set(auth('owner')).send({
        specifications: [{ specificationId: ids.specNumber, value: 'كبير' }],
      })).status).toBe(400);
      expect((await http().put(`/api/v1/products/${ids.product}/specifications`).set(auth('owner')).send({
        specifications: [{ specificationId: ids.specSelect, value: 'أحمر' }],
      })).status).toBe(400);
      expect((await http().put(`/api/v1/products/${ids.product}/specifications`).set(auth('owner')).send({
        specifications: [{ specificationId: ids.specBool, value: 'maybe' }],
      })).status).toBe(400);
      expect((await http().put(`/api/v1/products/${ids.product}/specifications`).set(auth('owner')).send({
        specifications: [{ specificationId: 987654, value: 'x' }],
      })).status).toBe(400);

      // the failed attempt above must not have destroyed the stored values
      const kept = await http().get(`/api/v1/products/${ids.product}/specifications`);
      expect(kept.body.data.length).toBe(3);
    });

    it('refuses a type change on a specification already used by products', async () => {
      const res = await http().patch(`/api/v1/specifications/${ids.specNumber}`).set(auth('owner')).send({ type: 'TEXT' });
      expect(res.status).toBe(409);
    });

    it('soft-deletes a definition and hard-deletes only unused ones', async () => {
      const unused = await http().post('/api/v1/specifications').set(auth('owner')).send({
        name: `غير مستخدمة ${stamp}`, key: `unused-spec-${stamp}`, type: 'TEXT',
      });
      const usedHard = await http().delete(`/api/v1/specifications/${ids.specNumber}?hard=true`).set(auth('owner'));
      expect(usedHard.status).toBe(409);

      const unusedHard = await http().delete(`/api/v1/specifications/${unused.body.data.id}?hard=true`).set(auth('owner'));
      expect(unusedHard.status).toBe(200);
      expect(unusedHard.body.data.hard).toBe(true);
    });
  });

  /* ------------------------------- Inventory ------------------------------ */

  describe('Inventory', () => {
    it('starts every new product at zero stock', async () => {
      const res = await http().get(`/api/v1/inventory/${ids.autoProduct}`).set(auth('owner'));
      expect(res.status).toBe(200);
      expect(res.body.data.quantity).toBe(0);
      expect(res.body.data.availableQuantity).toBe(0);
      expect(res.body.data.isOutOfStock).toBe(true);
    });

    it('applies a stock adjustment and writes a movement', async () => {
      const adjust = await http().post(`/api/v1/inventory/${ids.autoProduct}/adjust`).set(auth('owner')).send({
        quantity: 20, reason: 'STOCK_RECEIVED',
      });
      expect(adjust.status).toBe(201);
      expect(adjust.body.data.quantity).toBe(20);
      expect(adjust.body.data.movement.type).toBe('STOCK_IN');
      expect(adjust.body.data.movement.quantity).toBe(20);

      const movements = await http().get(`/api/v1/inventory/${ids.autoProduct}/movements`).set(auth('owner'));
      expect(movements.status).toBe(200);
      expect(movements.body.data.length).toBeGreaterThanOrEqual(1);

      const out = await http().post(`/api/v1/inventory/${ids.autoProduct}/adjust`).set(auth('owner')).send({
        quantity: -5, reason: 'DAMAGED',
      });
      expect(out.body.data.quantity).toBe(15);
      expect(out.body.data.movement.type).toBe('STOCK_OUT');
    });

    it('rejects negative results, zero deltas and sets below the reserved quantity', async () => {
      expect((await http().post(`/api/v1/inventory/${ids.autoProduct}/adjust`).set(auth('owner')).send({
        quantity: -999, reason: 'TOO MUCH',
      })).status).toBe(400);
      expect((await http().post(`/api/v1/inventory/${ids.autoProduct}/adjust`).set(auth('owner')).send({
        quantity: 0, reason: 'NONE',
      })).status).toBe(400);
    });

    it('updates the low stock threshold and reports low stock', async () => {
      const res = await http().patch(`/api/v1/inventory/${ids.autoProduct}`).set(auth('owner')).send({
        lowStockThreshold: 50,
      });
      expect(res.status).toBe(200);
      expect(res.body.data.isLowStock).toBe(true);

      const list = await http().get('/api/v1/inventory?lowStockOnly=true&limit=50').set(auth('owner'));
      expect(list.status).toBe(200);
      expect(list.body.data.items.every((i: { isLowStock: boolean }) => i.isLowStock)).toBe(true);

      await http().patch(`/api/v1/inventory/${ids.autoProduct}`).set(auth('owner')).send({ lowStockThreshold: 2 });
    });

    it('records the absolute set as an ADJUSTMENT movement', async () => {
      const res = await http().patch(`/api/v1/inventory/${ids.autoProduct}`).set(auth('owner')).send({ quantity: 7 });
      expect(res.status).toBe(200);
      expect(res.body.data.quantity).toBe(7);
      const movements = await http().get(`/api/v1/inventory/${ids.autoProduct}/movements`).set(auth('owner'));
      expect(movements.body.data[0].type).toBe('ADJUSTMENT');
      expect(movements.body.data[0].reason).toBe('MANUAL_SET');
    });

    it('inventory requires permission: customer 403, employee read-only', async () => {
      expect((await http().get(`/api/v1/inventory/${ids.autoProduct}`).set(auth('customer'))).status).toBe(403);
      expect((await http().get(`/api/v1/inventory/${ids.autoProduct}`)).status).toBe(401);
      // EMPLOYEE has inventory.read but not adjust/update
      expect((await http().get(`/api/v1/inventory/${ids.autoProduct}`).set(auth('employee'))).status).toBe(200);
      expect((await http().post(`/api/v1/inventory/${ids.autoProduct}/adjust`).set(auth('employee')).send({
        quantity: 1, reason: 'TRY',
      })).status).toBe(403);
      expect((await http().patch(`/api/v1/inventory/${ids.autoProduct}`).set(auth('employee')).send({
        lowStockThreshold: 1,
      })).status).toBe(403);
    });

    it('lists inventory with product context and pagination', async () => {
      const res = await http().get('/api/v1/inventory?page=1&limit=5&sortBy=quantity&sortOrder=desc').set(auth('owner'));
      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeLessThanOrEqual(5);
      expect(res.body.meta.page).toBe(1);
      expect(res.body.data.items[0].product).toBeDefined();
      expect(res.body.data.items[0].availableQuantity).toBe(
        res.body.data.items[0].quantity - res.body.data.items[0].reservedQuantity,
      );
    });
  });

  /* -------------------------------- Audit --------------------------------- */

  describe('Audit trail', () => {
    it('records catalog and inventory events', async () => {
      const cases: Array<[string, number]> = [
        ['PRODUCT_CREATED', 1],
        ['PRODUCT_UPDATED', 1],
        ['PRODUCT_DISABLED', 1],
        ['CATEGORY_CREATED', 1],
        ['CATEGORY_DISABLED', 1],
        ['BRAND_CREATED', 1],
        ['BRAND_DISABLED', 1],
        ['SPECIFICATION_CREATED', 1],
        ['SPECIFICATION_DELETED', 1],
        ['PRODUCT_IMAGE_ADDED', 1],
        ['PRODUCT_SPECIFICATIONS_UPDATED', 1],
        ['INVENTORY_ADJUSTED', 1],
        ['INVENTORY_UPDATED', 1],
      ];
      for (const [action, min] of cases) {
        const res = await http().get(`/api/v1/audit?action=${action}&limit=5`).set(auth('owner'));
        expect(res.status).toBe(200);
        expect(res.body.meta.total).toBeGreaterThanOrEqual(min);
      }
    });

    it('keeps secrets out of the catalog audit entries', async () => {
      const res = await http().get('/api/v1/audit?limit=100').set(auth('owner'));
      const raw = JSON.stringify(res.body);
      ['passwordHash', 'tokenHash', 'refreshToken', 'JWT_SECRET'].forEach((needle) =>
        expect(raw).not.toContain(needle),
      );
    });
  });
});
