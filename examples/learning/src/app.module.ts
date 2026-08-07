// ============================================================
// LESSON 2: The NestJS Module System
// ============================================================
//
// In NestJS, a Module is a class decorated with @Module() that
// organizes your application into cohesive blocks.
//
// Think of modules like boxes:
//   - "imports" = other boxes this box needs
//   - "controllers" = HTTP endpoint handlers in this box
//   - "providers" = services (business logic) in this box
//   - "exports" = things from this box that other boxes can use
//
// WHY MODULES MATTER:
// Without modules, all your code lives in one giant file. Modules
// let you split by feature (ProductModule, AuthModule) so each
// team/developer owns their slice.
//
// NESTJS-BOOT CONNECTION:
// In main.ts, createApp() reads your BootOptions and auto-creates
// infrastructure modules (DatabaseModule, CacheModule, AuthModule).
// YOUR AppModule only needs to declare YOUR feature modules.
//
// DatabaseModule.forFeature() tells nestjs-boot: "Register these
// Mongoose schemas on the 'master' connection." The string 'master'
// must match a key in your database.connections config.
// ============================================================

import { Module } from '@nestjs/common';
import { DatabaseModule } from 'nestjs-boot';

// Product feature
import { ProductController } from './product/product.controller';
import { ProductService } from './product/product.service';
import { Product, ProductSchema } from './product/product.schema';

// Auth feature
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { User, UserSchema } from './auth/user.schema';

@Module({
  imports: [
    // --------------------------------------------------------
    // Register Mongoose schemas with the 'master' database connection.
    //
    // DatabaseModule.forFeature(connectionName, schemas[])
    //   - connectionName must match a key in database.connections (main.ts)
    //   - schemas array: { name: 'ModelName', schema: MongooseSchema }
    //
    // After this, you can use @InjectModel('Product') in any service
    // within this module to get the Mongoose Model instance.
    // --------------------------------------------------------
    DatabaseModule.forFeature('master', [
      { name: Product.name, schema: ProductSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],

  // Controllers handle HTTP requests. NestJS routes requests to
  // the right controller method based on decorators like @Get(), @Post().
  controllers: [ProductController, AuthController],

  // Providers are injectable classes. NestJS creates ONE instance
  // of each provider and shares it (singleton pattern by default).
  // When ProductController needs ProductService, NestJS automatically
  // injects it via the constructor -- this is Dependency Injection (DI).
  providers: [ProductService, AuthService],
})
export class AppModule {}

// ============================================================
// WHAT'S HAPPENING UNDER THE HOOD:
//
// 1. NestJS sees @Module() and registers this class as a module
// 2. It creates instances of ProductService and AuthService
// 3. It creates instances of ProductController and AuthController
// 4. When creating controllers, it sees they need services in
//    their constructors, so it injects the service instances
// 5. DatabaseModule.forFeature() creates Mongoose Model providers
//    that can be injected with @InjectModel('Product')
//
// This "inversion of control" means YOUR code never calls `new`.
// NestJS manages object lifecycle for you.
//
// Next lesson: Open src/product/product.controller.ts
// ============================================================
