import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto, QueryReviewsDto } from './dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthUser } from '../auth/strategies/jwt.strategy';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'ثبت امتیاز' })
  createReview(@CurrentUser() user: AuthUser, @Body() dto: CreateReviewDto) {
    return this.reviewsService.createReview(user.id, dto);
  }

  @Get('user/:userId')
  @Public()
  @ApiOperation({ summary: 'امتیازات یک کاربر' })
  getUserReviews(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: QueryReviewsDto,
  ) {
    return this.reviewsService.getUserReviews(userId, query);
  }

  @Get('farmer/:farmerId')
  @Public()
  @ApiOperation({ summary: 'امتیازات باغدار' })
  getFarmerReviews(
    @Param('farmerId', ParseUUIDPipe) farmerId: string,
    @Query() query: QueryReviewsDto,
  ) {
    return this.reviewsService.getFarmerReviews(farmerId, query);
  }
}
