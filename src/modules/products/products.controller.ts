import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto, QueryProductsDto } from './dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '@prisma/client';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'لیست محصولات با فیلتر (عمومی)' })
  findAll(@Query() query: QueryProductsDto) {
    return this.productsService.findAll(query);
  }

  @Get('my')
  @ApiBearerAuth('access-token')
  @Roles(UserRole.FARMER)
  @ApiOperation({ summary: 'محصولات من (باغدار)' })
  findMyProducts(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryProductsDto,
  ) {
    return this.productsService.findMyProducts(user.id, query);
  }

  @Get(':idOrSlug')
  @Public()
  @ApiOperation({ summary: 'جزئیات محصول (عمومی)' })
  findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.productsService.findOne(idOrSlug);
  }

  @Post()
  @ApiBearerAuth('access-token')
  @Roles(UserRole.FARMER)
  @ApiOperation({ summary: 'ایجاد محصول (باغدار)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.productsService.create(user.id, dto);
  }

  @Patch(':id/approve')
  @ApiBearerAuth('access-token')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'تأیید محصول (ادمین)' })
  approveProduct(@Param('id') id: string) {
    return this.productsService.approveProduct(id);
  }

  @Patch(':id')
  @ApiBearerAuth('access-token')
  @Roles(UserRole.FARMER)
  @ApiOperation({ summary: 'ویرایش محصول (باغدار)' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(user.id, id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'حذف محصول (باغدار یا ادمین)' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.productsService.remove(user.id, id, user.role);
  }
}
