/** Safe API/service errors shared without loading prototype database fixtures. */
export class ServiceError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    Object.assign(this, extra);
  }
}
