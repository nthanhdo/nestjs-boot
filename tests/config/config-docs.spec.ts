import * as Joi from 'joi';
import { generateConfigDocs } from '../../src/config/config-docs';
import { bootOptionsSchema } from '../../src/config/validators';

describe('generateConfigDocs', () => {
  it('generates a Markdown table with correct headers', () => {
    const schema = Joi.object({
      port: Joi.number().default(3000),
      host: Joi.string().required(),
    });

    const docs = generateConfigDocs(schema);

    expect(docs).toContain('# nestjs-boot Config Reference');
    expect(docs).toContain('| Path | Type | Required | Default | Allowed Values | Description |');
    expect(docs).toContain('|------|------|----------|---------|----------------|-------------|');
  });

  it('marks required fields as required and shows defaults for optional ones', () => {
    const schema = Joi.object({
      secret: Joi.string().required(),
      timeout: Joi.number().default(5000).optional(),
    });

    const docs = generateConfigDocs(schema);

    // Required field
    expect(docs).toMatch(/`secret`.*yes/);
    // Field with default
    expect(docs).toContain('5000');
  });

  it('handles the full bootOptionsSchema without throwing', () => {
    expect(() => generateConfigDocs(bootOptionsSchema)).not.toThrow();
    const docs = generateConfigDocs(bootOptionsSchema);
    // Should include known named-key paths from the schema
    expect(docs).toContain('cache.redis.url');
    expect(docs).toContain('Generated at:');
    // Should cover multiple sections
    expect(docs).toContain('tracing.exporter');
    expect(docs).toContain('queue.driver');
  });
});
