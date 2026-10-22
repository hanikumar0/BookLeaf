const { ZodError } = require('zod');
const { HttpError } = require('../errors');

/** validate({ body, query }) – parses with zod schemas and replaces req.body/query with clean values. */
module.exports = (schemas) => (req, _res, next) => {
  try {
    for (const key of ['body', 'query']) if (schemas[key]) req[key] = schemas[key].parse(req[key] ?? {});
    next();
  } catch (e) {
    if (e instanceof ZodError)
      return next(new HttpError(400, 'Validation failed', e.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))));
    next(e);
  }
};
