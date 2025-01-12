import { Type } from "class-transformer";
import { IsOptional, IsPositive } from "class-validator";

export class PaginationDto {
    @IsPositive()
    @IsOptional()
    @Type(() => Number) // El valor que recibira sera un estring y este lo comvertira a numero
    page?: number = 1;

    @IsPositive()
    @IsOptional()
    @Type(() => Number) // El valor que recibira sera un estring y este lo comvertira a numero
    limit?: number = 10;
}

