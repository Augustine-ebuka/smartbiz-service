/**
 * Thrown when a lookup by id finds nothing. Controllers can check for this
 * specific type to return 404, while any other error still falls through
 * to the generic error-handling middleware.
 */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}