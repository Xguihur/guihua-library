/**
 * M1 path kept stable for the book/comment placeholders. The real implementation
 * now lives with the session module: anonymous writes are 401, valid sessions 403.
 */
export { AuthenticatedGuard } from '../auth/session.guard';
