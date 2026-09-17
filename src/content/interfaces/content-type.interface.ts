/**
 * Supported field types for content type definitions.
 */
export type ContentFieldType =
  | 'text'
  | 'textarea'
  | 'richtext'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'media'
  | 'reference'
  | 'json'
  | 'enum'
  | 'slug'
  | 'url'
  | 'email'
  | 'color'
  | 'component';

/**
 * Validation rules for a content field.
 */
export interface ContentFieldValidation {
  required?: boolean;
  unique?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  allowedValues?: string[];
}

/**
 * Reference field configuration.
 */
export interface ContentReferenceConfig {
  /** Allowed content type slugs for this reference */
  allowedTypes?: string[];
  /** Allow multiple references */
  multiple?: boolean;
  /** Maximum number of references (for multiple) */
  maxRefs?: number;
}

/**
 * Enum field configuration.
 */
export interface ContentEnumConfig {
  /** Available options */
  options: Array<{ label: string; value: string }>;
  /** Allow multiple selections */
  multiple?: boolean;
}

/**
 * A single field definition within a content type.
 */
export interface ContentFieldDefinition {
  /** Unique field identifier (snake_case) */
  name: string;
  /** Display label */
  label: string;
  /** Field type */
  type: ContentFieldType;
  /** Whether this field is localizable */
  localized?: boolean;
  /** Validation rules */
  validation?: ContentFieldValidation;
  /** Reference config (only for type='reference') */
  referenceConfig?: ContentReferenceConfig;
  /** Enum config (only for type='enum') */
  enumConfig?: ContentEnumConfig;
  /** Component slug (only for type='component') */
  componentSlug?: string;
  /** Source field for auto-generation (only for type='slug') */
  slugSource?: string;
  /** Help text displayed in UI */
  helpText?: string;
  /** Default value */
  defaultValue?: unknown;
  /** Display order */
  order?: number;
}

/**
 * Content type entity interface.
 */
export interface IContentType {
  id: string;
  name: string;
  slug: string;
  description?: string;
  fields: ContentFieldDefinition[];
  /** Slugs of reusable components used by this type */
  components: string[];
  tenantId?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Reusable component entity interface.
 */
export interface IContentComponent {
  id: string;
  name: string;
  slug: string;
  fields: ContentFieldDefinition[];
  tenantId?: string;
  createdAt: Date;
  updatedAt: Date;
}
