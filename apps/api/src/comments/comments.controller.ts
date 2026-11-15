import { Controller, Get, HttpCode, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import { parseCommentsQuery, type CommentListResponse } from '@guihua/contracts';
import { AuthenticatedGuard } from '../common/authenticated.guard';
import { unauthorizedError } from '../common/api-exception';
import { CommentsService } from './comments.service';

@Controller('books')
export class CommentsController {
  constructor(@Inject(CommentsService) private readonly commentsService: CommentsService) {}

  @Get(':bookId/comments')
  async list(
    @Param('bookId') bookId: string,
    @Query() query: Record<string, unknown>,
  ): Promise<CommentListResponse> {
    return this.commentsService.listForBook(bookId, parseCommentsQuery(query));
  }

  /** M1 has no sessions; commenting is an M3 capability. */
  @Post(':bookId/comments')
  @HttpCode(201)
  @UseGuards(AuthenticatedGuard)
  create(): never {
    throw unauthorizedError();
  }
}
