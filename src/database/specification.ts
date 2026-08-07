import type { FilterQuery } from 'mongoose';

/**
 * Specification pattern for composable query filters.
 *
 * Allows building complex, reusable query predicates that compose
 * with and/or/not operators and produce Mongoose FilterQuery objects.
 *
 * @example
 * ```ts
 * class IsActiveSpec extends Specification<Product> {
 *   toFilter() { return { isActive: true }; }
 * }
 *
 * class InCategorySpec extends Specification<Product> {
 *   constructor(private category: string) { super(); }
 *   toFilter() { return { category: this.category }; }
 * }
 *
 * const activeElectronics = new IsActiveSpec().and(new InCategorySpec('electronics'));
 * const results = await repo.findAll(activeElectronics.toFilter());
 * ```
 */
export abstract class Specification<T> {
  abstract toFilter(): FilterQuery<T>;

  and(other: Specification<T>): Specification<T> {
    return new AndSpecification(this, other);
  }

  or(other: Specification<T>): Specification<T> {
    return new OrSpecification(this, other);
  }

  not(): Specification<T> {
    return new NotSpecification(this);
  }
}

/**
 * Combines two specifications with $and.
 */
export class AndSpecification<T> extends Specification<T> {
  constructor(
    private readonly left: Specification<T>,
    private readonly right: Specification<T>,
  ) {
    super();
  }

  toFilter(): FilterQuery<T> {
    return { $and: [this.left.toFilter(), this.right.toFilter()] } as FilterQuery<T>;
  }
}

/**
 * Combines two specifications with $or.
 */
export class OrSpecification<T> extends Specification<T> {
  constructor(
    private readonly left: Specification<T>,
    private readonly right: Specification<T>,
  ) {
    super();
  }

  toFilter(): FilterQuery<T> {
    return { $or: [this.left.toFilter(), this.right.toFilter()] } as FilterQuery<T>;
  }
}

/**
 * Negates a specification with $not wrapped in $nor.
 */
export class NotSpecification<T> extends Specification<T> {
  constructor(private readonly spec: Specification<T>) {
    super();
  }

  toFilter(): FilterQuery<T> {
    return { $nor: [this.spec.toFilter()] } as FilterQuery<T>;
  }
}
