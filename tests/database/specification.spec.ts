import { describe, it, expect } from 'vitest';
import {
  Specification,
  AndSpecification,
  OrSpecification,
  NotSpecification,
} from '../../src/database/specification';

// Concrete specifications for testing
class IsActiveSpec extends Specification<any> {
  toFilter() {
    return { isActive: true };
  }
}

class InCategorySpec extends Specification<any> {
  constructor(private category: string) {
    super();
  }
  toFilter() {
    return { category: this.category };
  }
}

class MinPriceSpec extends Specification<any> {
  constructor(private min: number) {
    super();
  }
  toFilter() {
    return { price: { $gte: this.min } };
  }
}

describe('Specification', () => {
  it('should produce a simple filter from a concrete specification', () => {
    const spec = new IsActiveSpec();
    expect(spec.toFilter()).toEqual({ isActive: true });
  });

  it('should compose two specs with and()', () => {
    const spec = new IsActiveSpec().and(new InCategorySpec('electronics'));
    const filter = spec.toFilter();
    expect(filter).toEqual({
      $and: [{ isActive: true }, { category: 'electronics' }],
    });
  });

  it('should compose two specs with or()', () => {
    const spec = new InCategorySpec('books').or(new InCategorySpec('movies'));
    const filter = spec.toFilter();
    expect(filter).toEqual({
      $or: [{ category: 'books' }, { category: 'movies' }],
    });
  });

  it('should negate a spec with not()', () => {
    const spec = new IsActiveSpec().not();
    const filter = spec.toFilter();
    expect(filter).toEqual({
      $nor: [{ isActive: true }],
    });
  });

  it('should compose multiple specs in a chain', () => {
    const spec = new IsActiveSpec()
      .and(new InCategorySpec('electronics'))
      .and(new MinPriceSpec(100));
    const filter = spec.toFilter();

    // and(and(active, electronics), minPrice)
    expect(filter).toEqual({
      $and: [
        { $and: [{ isActive: true }, { category: 'electronics' }] },
        { price: { $gte: 100 } },
      ],
    });
  });
});
