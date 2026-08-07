import { describe, it, expect } from 'vitest';
import { parseDiError, formatDiError } from '../../src/di/di-error-handler';

describe('DI Error Handler', () => {
  describe('parseDiError', () => {
    it('should detect circular dependency errors', () => {
      const error = new Error(
        'A circular dependency has been detected. Please, make sure that each side of a bi-directional relationships are decorated with "forwardRef()"',
      );
      const result = parseDiError(error);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('circular');
      expect(result!.suggestion).toContain('forwardRef()');
    });

    it('should detect unresolved dependency errors', () => {
      const error = new Error(
        "Nest can't resolve dependencies of the UserService (?). Please make sure that the argument DatabaseService at index [0] is available in the UserModule context.",
      );
      const result = parseDiError(error);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('unresolved');
      expect(result!.modules).toContain('UserModule');
      expect(result!.providers).toContain('DatabaseService');
    });

    it('should return null for non-DI errors', () => {
      const error = new Error('Some other error');
      expect(parseDiError(error)).toBeNull();
    });

    it('should extract module names from context pattern', () => {
      const error = new Error(
        "Nest can't resolve dependencies of the AuthService (?). Please make sure that the argument JwtService at index [0] is available in the AuthModule context.",
      );
      const result = parseDiError(error);
      expect(result!.modules).toContain('AuthModule');
    });
  });

  describe('formatDiError', () => {
    it('should format circular dependency info with box', () => {
      const output = formatDiError({
        type: 'circular',
        modules: ['ModuleA', 'ModuleB'],
        providers: [],
        originalMessage: 'circular dependency detected',
        suggestion: 'Use forwardRef()',
      });
      expect(output).toContain('CIRCULAR DEPENDENCY');
      expect(output).toContain('ModuleA, ModuleB');
      expect(output).toContain('NEST_DEBUG=true');
      expect(output).toContain('npx nestjs-boot graph');
    });

    it('should format unresolved dependency info', () => {
      const output = formatDiError({
        type: 'unresolved',
        modules: ['AppModule'],
        providers: ['SomeService'],
        originalMessage: "can't resolve dependencies",
        suggestion: 'Check imports',
      });
      expect(output).toContain('UNRESOLVED DEPENDENCY');
      expect(output).toContain('AppModule');
    });
  });
});
