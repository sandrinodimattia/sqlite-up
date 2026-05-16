import { describe, expectTypeOf, it } from 'vitest';

import type { Migrator } from './index';
import type { ContextArg, Migration, MigrationResult, SqliteDatabase } from './types';

interface MyContext {
  foo: string;
}

describe('migration context types', () => {
  it('should allow typed migration callbacks to require context', () => {
    const up: Migration<MyContext>['up'] = async (_db: SqliteDatabase, ctx: MyContext): Promise<void> => {
      expectTypeOf(ctx.foo).toEqualTypeOf<string>();
    };

    const down: Migration<MyContext>['down'] = async (_db: SqliteDatabase, ctx: MyContext): Promise<void> => {
      expectTypeOf(ctx.foo).toEqualTypeOf<string>();
    };

    expectTypeOf(up).toEqualTypeOf<Migration<MyContext>['up']>();
    expectTypeOf(down).toEqualTypeOf<Migration<MyContext>['down']>();
  });

  it('should keep the public migration name property compatible', () => {
    const migration: Migration = {
      name: '001_init.ts',
      up: async () => {},
      down: async () => {},
    };

    expectTypeOf(migration.name).toEqualTypeOf<string>();
  });

  it('should require context for typed migrator apply and rollback calls', () => {
    expectTypeOf<Parameters<Migrator<MyContext>['apply']>>().toEqualTypeOf<[value: MyContext]>();
    expectTypeOf<Parameters<Migrator<MyContext>['rollback']>>().toEqualTypeOf<[value: MyContext]>();
    expectTypeOf<ReturnType<Migrator<MyContext>['apply']>>().toEqualTypeOf<Promise<MigrationResult>>();
    expectTypeOf<ReturnType<Migrator<MyContext>['rollback']>>().toEqualTypeOf<Promise<MigrationResult>>();

    expectTypeOf<Parameters<Migrator['apply']>>().toEqualTypeOf<[]>();
    expectTypeOf<Parameters<Migrator['rollback']>>().toEqualTypeOf<[]>();
    expectTypeOf<ReturnType<Migrator['apply']>>().toEqualTypeOf<Promise<MigrationResult>>();
    expectTypeOf<ReturnType<Migrator['rollback']>>().toEqualTypeOf<Promise<MigrationResult>>();
  });

  it('should treat context unions as one required argument', () => {
    expectTypeOf<ContextArg<MyContext | undefined>>().toEqualTypeOf<[ctx: MyContext | undefined]>();
    expectTypeOf<Parameters<Migrator<MyContext | undefined>['apply']>>().toEqualTypeOf<[ctx: MyContext | undefined]>();
  });
});
