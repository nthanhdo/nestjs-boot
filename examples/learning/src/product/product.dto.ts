// ============================================================
// LESSON 6: DTOs + class-validator
// ============================================================
//
// DTO = Data Transfer Object. It defines the SHAPE of data
// coming INTO your API (request body) and validates it.
//
// WHY DTOs (not just raw req.body):
//   1. VALIDATION: @IsString() rejects numbers in name field
//   2. WHITELIST: Extra fields in the body are stripped out
//   3. DOCUMENTATION: The DTO IS the API contract
//   4. TYPE SAFETY: TypeScript knows exactly what fields exist
//
// DTO vs SCHEMA:
//   - DTO validates HTTP INPUT (what the client sends)
//   - Schema validates DATABASE OUTPUT (what gets stored)
//   They can differ! Example: DTO might accept "categoryName"
//   but schema stores "categoryId" after lookup.
//
// HOW IT WORKS:
// NestJS has a ValidationPipe that runs class-validator decorators
// on @Body() parameters. Invalid data -> 400 Bad Request with
// a detailed error message listing every validation failure.
// ============================================================

import {
  IsString,
  IsNumber,
  IsOptional,
  Min,
  MaxLength,
} from 'class-validator';

// --------------------------------------------------------
// CreateProductDto -- validates POST /products body
//
// Each property has decorators that define validation rules.
// Multiple decorators stack: @IsString() AND @MaxLength(200)
// means "must be a string AND must be <= 200 characters."
//
// If validation fails, NestJS returns:
// {
//   "statusCode": 400,
//   "message": ["name must be a string", "price must not be less than 0"],
//   "error": "Bad Request"
// }
// --------------------------------------------------------
export class CreateProductDto {
  @IsString({ message: 'Product name must be a string' })
  @MaxLength(200, { message: 'Product name cannot exceed 200 characters' })
  name!: string;

  @IsNumber({}, { message: 'Price must be a number' })
  @Min(0, { message: 'Price cannot be negative' })
  price!: number;

  @IsNumber({}, { message: 'Stock must be a number' })
  @Min(0, { message: 'Stock cannot be negative' })
  @IsOptional()  // stock is optional in the request (defaults to 0 in schema)
  stock?: number;

  @IsString()
  @MaxLength(2000)
  @IsOptional()  // description is optional
  description?: string;
}

// --------------------------------------------------------
// UpdateProductDto -- validates PUT /products/:id body
//
// For updates, ALL fields should be optional -- the client
// sends only the fields they want to change.
//
// We could use PartialType from @nestjs/mapped-types to auto-
// generate this from CreateProductDto, but writing it explicitly
// is clearer for learning.
// --------------------------------------------------------
export class UpdateProductDto {
  @IsString()
  @MaxLength(200)
  @IsOptional()
  name?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  stock?: number;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  description?: string;
}

// ============================================================
// WHAT'S HAPPENING UNDER THE HOOD:
//
// 1. Client sends POST /products with JSON body
// 2. NestJS sees @Body() dto: CreateProductDto on the controller method
// 3. ValidationPipe creates an instance of CreateProductDto
// 4. It copies request body properties onto the instance
// 5. class-validator checks every decorated property
// 6. If ANY check fails -> 400 error with all failure messages
// 7. If ALL checks pass -> your controller method runs with
//    a validated, typed DTO object
//
// IMPORTANT: For this to work, you need to enable ValidationPipe.
// nestjs-boot does NOT auto-enable it (it's app-specific).
// Add this to main.ts after createApp():
//
//   import { ValidationPipe } from '@nestjs/common';
//   app.useGlobalPipes(new ValidationPipe({
//     whitelist: true,    // strip properties without decorators
//     transform: true,    // auto-convert types (string "5" -> number 5)
//   }));
//
// Next lesson: Open src/auth/auth.controller.ts
// ============================================================
