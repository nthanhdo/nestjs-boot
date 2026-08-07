import * as Joi from 'joi';
import { formatConfigError } from '../../src/config/config-errors';

function makeJoiError(schema: Joi.Schema, value: unknown): Joi.ValidationError {
  const { error } = schema.validate(value, { abortEarly: false });
  if (!error) throw new Error('Expected a validation error but schema passed');
  return error;
}

describe('formatConfigError', () => {
  it('produces output mentioning the env var name for known paths', () => {
    const schema = Joi.object({
      database: Joi.object({
        connections: Joi.object({
          master: Joi.object({
            writerUri: Joi.string().uri().required(),
          }).required(),
        }).min(1).required(),
      }).required(),
    }).options({ abortEarly: false });

    const error = makeJoiError(schema, { database: { connections: { master: {} } } });
    const output = formatConfigError(error);

    expect(output).toContain('MONGO_URI');
    expect(output).toContain('database.connections.master.writerUri');
  });

  it('includes the quick-fix checklist in every output', () => {
    const schema = Joi.object({
      port: Joi.number().required(),
    }).options({ abortEarly: false });

    const error = makeJoiError(schema, {});
    const output = formatConfigError(error);

    expect(output).toContain('Quick-fix checklist');
    expect(output).toContain('.env');
    expect(output).toContain('createApp()');
  });

  it('falls back gracefully for unknown paths with a generic fix hint', () => {
    const schema = Joi.object({
      myService: Joi.object({
        apiKey: Joi.string().required(),
      }).required(),
    }).options({ abortEarly: false });

    const error = makeJoiError(schema, { myService: {} });
    const output = formatConfigError(error);

    // Should not crash, should contain the path
    expect(output).toContain('myService.apiKey');
    // Should suggest a fix
    expect(output).toMatch(/Fix|createApp\(\)/i);
  });
});
