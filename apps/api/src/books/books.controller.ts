import { Controller, Get, HttpCode, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import { parseBookListQuery, type BookDetailDto, type BookListResponse } from '@guihua/contracts';
import { AuthenticatedGuard } from '../common/authenticated.guard';
import { unauthorizedError } from '../common/api-exception';
import { BooksService } from './books.service';

@Controller('books')
export class BooksController {
  constructor(@Inject(BooksService) private readonly booksService: BooksService) {}

  @Get()
  async list(@Query() query: Record<string, unknown>): Promise<BookListResponse> {
    return this.booksService.list(parseBookListQuery(query));
  }

  @Get(':bookId')
  async detail(@Param('bookId') bookId: string): Promise<BookDetailDto> {
    return this.booksService.findPublicById(bookId);
  }

  /** M1 has no sessions; publishing is an M3 capability. */
  @Post()
  @HttpCode(201)
  @UseGuards(AuthenticatedGuard)
  create(): never {
    throw unauthorizedError();
  }
}
