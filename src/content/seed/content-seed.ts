import { Logger } from '@nestjs/common';
import type { ContentFieldDefinition } from '../interfaces';

const logger = new Logger('ContentSeed');

/**
 * Sample content types, components, locales, and entries for demo/development.
 * Call `seedContentData(prismaClient)` after Prisma connects.
 */
export async function seedContentData(prisma: any, tenantId?: string): Promise<void> {
  logger.log('Seeding content data...');

  // --- Locales ---
  await prisma.contentLocale.upsert({
    where: { tenantId_code: { tenantId: tenantId ?? '', code: 'en' } },
    update: {},
    create: { code: 'en', name: 'English', isDefault: true, tenantId },
  });
  await prisma.contentLocale.upsert({
    where: { tenantId_code: { tenantId: tenantId ?? '', code: 'vi' } },
    update: {},
    create: { code: 'vi', name: 'Vietnamese', isDefault: false, fallbackLocale: 'en', tenantId },
  });
  logger.log('Locales seeded: en, vi');

  // --- Components ---
  const seoFields: ContentFieldDefinition[] = [
    { name: 'meta_title', label: 'Meta Title', type: 'text', validation: { maxLength: 60 } },
    { name: 'meta_description', label: 'Meta Description', type: 'textarea', validation: { maxLength: 160 } },
    { name: 'og_image', label: 'OG Image', type: 'url' },
  ];

  await prisma.contentComponent.upsert({
    where: { tenantId_slug: { tenantId: tenantId ?? '', slug: 'seo' } },
    update: { fields: JSON.stringify(seoFields) },
    create: { name: 'SEO', slug: 'seo', fields: JSON.stringify(seoFields), tenantId },
  });
  logger.log('Component seeded: seo');

  // --- Content Type: Blog Post ---
  const blogFields: ContentFieldDefinition[] = [
    { name: 'title', label: 'Title', type: 'text', localized: true, validation: { required: true, maxLength: 255 } },
    { name: 'slug', label: 'Slug', type: 'slug', slugSource: 'title' },
    { name: 'excerpt', label: 'Excerpt', type: 'textarea', localized: true, validation: { maxLength: 300 } },
    { name: 'body', label: 'Body', type: 'richtext', localized: true, validation: { required: true } },
    { name: 'cover_image', label: 'Cover Image', type: 'url' },
    { name: 'category', label: 'Category', type: 'enum', enumConfig: { options: [
      { label: 'Technology', value: 'technology' },
      { label: 'Business', value: 'business' },
      { label: 'Lifestyle', value: 'lifestyle' },
    ] } },
    { name: 'tags', label: 'Tags', type: 'json', helpText: 'Array of tag strings' },
    { name: 'featured', label: 'Featured', type: 'boolean', defaultValue: false },
    { name: 'author', label: 'Author', type: 'text' },
    { name: 'published_date', label: 'Published Date', type: 'date' },
  ];

  const blogType = await prisma.contentType.upsert({
    where: { tenantId_slug: { tenantId: tenantId ?? '', slug: 'blog-post' } },
    update: { fields: JSON.stringify(blogFields) },
    create: { name: 'Blog Post', slug: 'blog-post', description: 'Blog articles with rich text content', fields: JSON.stringify(blogFields), components: ['seo'], tenantId },
  });
  logger.log('Content type seeded: blog-post');

  // --- Content Type: Product ---
  const productFields: ContentFieldDefinition[] = [
    { name: 'name', label: 'Product Name', type: 'text', localized: true, validation: { required: true } },
    { name: 'slug', label: 'Slug', type: 'slug', slugSource: 'name' },
    { name: 'description', label: 'Description', type: 'richtext', localized: true },
    { name: 'price', label: 'Price', type: 'number', validation: { required: true, min: 0 } },
    { name: 'currency', label: 'Currency', type: 'enum', enumConfig: { options: [
      { label: 'USD', value: 'USD' },
      { label: 'VND', value: 'VND' },
      { label: 'EUR', value: 'EUR' },
    ] } },
    { name: 'sku', label: 'SKU', type: 'text', validation: { unique: true } },
    { name: 'in_stock', label: 'In Stock', type: 'boolean', defaultValue: true },
    { name: 'images', label: 'Images', type: 'json', helpText: 'Array of image URLs' },
    { name: 'category', label: 'Category', type: 'text' },
  ];

  const productType = await prisma.contentType.upsert({
    where: { tenantId_slug: { tenantId: tenantId ?? '', slug: 'product' } },
    update: { fields: JSON.stringify(productFields) },
    create: { name: 'Product', slug: 'product', description: 'E-commerce product listings', fields: JSON.stringify(productFields), components: ['seo'], tenantId },
  });
  logger.log('Content type seeded: product');

  // --- Content Type: FAQ ---
  const faqFields: ContentFieldDefinition[] = [
    { name: 'question', label: 'Question', type: 'text', localized: true, validation: { required: true } },
    { name: 'answer', label: 'Answer', type: 'richtext', localized: true, validation: { required: true } },
    { name: 'category', label: 'Category', type: 'text' },
    { name: 'order', label: 'Display Order', type: 'number', defaultValue: 0 },
  ];

  const faqType = await prisma.contentType.upsert({
    where: { tenantId_slug: { tenantId: tenantId ?? '', slug: 'faq' } },
    update: { fields: JSON.stringify(faqFields) },
    create: { name: 'FAQ', slug: 'faq', description: 'Frequently asked questions', fields: JSON.stringify(faqFields), components: [], tenantId },
  });
  logger.log('Content type seeded: faq');

  // --- Sample Entries: Blog Posts ---
  await prisma.contentEntry.createMany({
    data: [
      {
        contentTypeId: blogType.id,
        data: {
          title: 'Getting Started with nestjs-boot',
          slug: 'getting-started-nestjs-boot',
          excerpt: 'Learn how to build production-ready NestJS apps with zero boilerplate.',
          body: '<p>nestjs-boot provides Spring Boot-style auto-configuration for NestJS...</p>',
          category: 'technology',
          tags: ['nestjs', 'typescript', 'backend'],
          featured: true,
          author: 'nthanhdo',
          published_date: '2026-09-01',
        },
        locale: 'en', status: 'PUBLISHED', slug: 'getting-started-nestjs-boot',
        publishedAt: new Date(), tenantId,
      },
      {
        contentTypeId: blogType.id,
        data: {
          title: 'Bắt đầu với nestjs-boot',
          slug: 'getting-started-nestjs-boot',
          excerpt: 'Hướng dẫn xây dựng ứng dụng NestJS production-ready không cần boilerplate.',
          body: '<p>nestjs-boot cung cấp auto-configuration kiểu Spring Boot cho NestJS...</p>',
          category: 'technology',
          tags: ['nestjs', 'typescript', 'backend'],
          featured: true,
          author: 'nthanhdo',
          published_date: '2026-09-01',
        },
        locale: 'vi', status: 'PUBLISHED', slug: 'getting-started-nestjs-boot',
        publishedAt: new Date(), tenantId,
      },
      {
        contentTypeId: blogType.id,
        data: {
          title: 'Content Service: Build Your Own Headless CMS',
          slug: 'content-service-headless-cms',
          excerpt: 'How we built a Contentful alternative inside nestjs-boot.',
          body: '<p>The content service module provides a complete headless CMS...</p>',
          category: 'technology',
          tags: ['cms', 'headless', 'contentful'],
          featured: false,
          author: 'nthanhdo',
        },
        locale: 'en', status: 'DRAFT', slug: 'content-service-headless-cms', tenantId,
      },
    ],
    skipDuplicates: true,
  });
  logger.log('Blog post entries seeded (3 entries, 2 locales)');

  // --- Sample Entries: Products ---
  await prisma.contentEntry.createMany({
    data: [
      {
        contentTypeId: productType.id,
        data: {
          name: 'nestjs-boot Enterprise License',
          slug: 'nestjs-boot-enterprise',
          description: '<p>Full enterprise support with priority bug fixes and SLA.</p>',
          price: 999, currency: 'USD', sku: 'NB-ENT-001',
          in_stock: true, category: 'Software',
        },
        locale: 'en', status: 'PUBLISHED', slug: 'nestjs-boot-enterprise',
        publishedAt: new Date(), tenantId,
      },
      {
        contentTypeId: productType.id,
        data: {
          name: 'NestJS Starter Template',
          slug: 'nestjs-starter-template',
          description: '<p>Pre-configured project template with all best practices.</p>',
          price: 49, currency: 'USD', sku: 'NB-TPL-001',
          in_stock: true, category: 'Templates',
        },
        locale: 'en', status: 'PUBLISHED', slug: 'nestjs-starter-template',
        publishedAt: new Date(), tenantId,
      },
    ],
    skipDuplicates: true,
  });
  logger.log('Product entries seeded (2 entries)');

  // --- Sample Entries: FAQs ---
  await prisma.contentEntry.createMany({
    data: [
      {
        contentTypeId: faqType.id,
        data: {
          question: 'What is nestjs-boot?',
          answer: '<p>A Spring Boot-style auto-configuration framework for NestJS that eliminates boilerplate infrastructure wiring.</p>',
          category: 'General', order: 1,
        },
        locale: 'en', status: 'PUBLISHED', slug: 'what-is-nestjs-boot',
        publishedAt: new Date(), tenantId,
      },
      {
        contentTypeId: faqType.id,
        data: {
          question: 'nestjs-boot là gì?',
          answer: '<p>Một framework auto-configuration kiểu Spring Boot cho NestJS, loại bỏ boilerplate cho infrastructure.</p>',
          category: 'General', order: 1,
        },
        locale: 'vi', status: 'PUBLISHED', slug: 'what-is-nestjs-boot',
        publishedAt: new Date(), tenantId,
      },
      {
        contentTypeId: faqType.id,
        data: {
          question: 'How is the content service different from Strapi?',
          answer: '<p>It runs as a module inside nestjs-boot — no separate process, no plugin system to learn. Just config and go.</p>',
          category: 'Content Service', order: 2,
        },
        locale: 'en', status: 'PUBLISHED', slug: 'content-vs-strapi',
        publishedAt: new Date(), tenantId,
      },
    ],
    skipDuplicates: true,
  });
  logger.log('FAQ entries seeded (3 entries, 2 locales)');

  logger.log('Content seed complete!');
}
