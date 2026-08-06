import { Schema, Document } from 'mongoose';

export interface SEOMeta {
  metaTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  ogImage: string;
}

export interface ArticleDocument extends Document {
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  author: string;
  category: string;
  tags: string[];
  status: 'draft' | 'published' | 'archived' | 'deleted';
  coverImage: string;
  seo: SEOMeta;
  viewCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export const ArticleSchema = new Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    content: { type: String, required: true },
    excerpt: { type: String, default: '' },
    author: { type: String, required: true },
    category: { type: String, default: 'uncategorized', index: true },
    tags: { type: [String], default: [], index: true },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived', 'deleted'],
      default: 'draft',
      index: true,
    },
    coverImage: { type: String, default: '' },
    seo: {
      metaTitle: { type: String, default: '' },
      metaDescription: { type: String, default: '' },
      canonicalUrl: { type: String, default: '' },
      ogImage: { type: String, default: '' },
    },
    viewCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

// Compound index for filtered listing queries
ArticleSchema.index({ status: 1, category: 1, createdAt: -1 });

// Full-text search index on title + content
ArticleSchema.index({ title: 'text', content: 'text' });

export const Article = { name: 'Article' };
