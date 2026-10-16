/** Error shape every route returns: { code, message }. The frontend shows `message` and branches on `code`. */
export class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function notFound(req, res) {
  res.status(404).json({ code: 'NOT_FOUND', message: `No route for ${req.method} ${req.originalUrl}` });
}

// Express recognizes error handlers by their four arguments.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ code: err.code, message: err.message, ...err.extra });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Request body is not valid JSON.' });
  }
  console.error(err);
  return res.status(500).json({ code: 'SERVER_ERROR', message: 'Something went wrong. Please try again.' });
}
