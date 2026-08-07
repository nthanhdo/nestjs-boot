import {
  IsString,
  IsNumber,
  IsOptional,
  Min,
  MaxLength,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  stock?: number;

  @IsString()              // <-- ADDED
  @MaxLength(100)
  category!: string;       // required (no @IsOptional)

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  description?: string;
}

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

  @IsString()              // <-- ADDED
  @MaxLength(100)
  @IsOptional()            // optional for updates
  category?: string;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  description?: string;
}
