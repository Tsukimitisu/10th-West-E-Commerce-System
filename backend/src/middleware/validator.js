import { validationResult, matchedData } from 'express-validator';

export const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const rawErrors = errors.array();
    const fieldErrors = rawErrors.reduce((acc, error) => {
      if (error.type === 'field' && error.path && !acc[error.path]) {
        acc[error.path] = error.msg;
      }
      return acc;
    }, {});

    return res.status(400).json({ 
      message: 'Validation failed', 
      errors: rawErrors,
      fieldErrors,
    });
  }

  // Extract only the validated and sanitized data, ignoring unexpected fields
  req.validatedData = matchedData(req, { locations: ['body', 'query', 'params'] });
  
  next();
};

/**
 * Common sanitization tool chains for reuse
 * This helps prevent XSS and keeps data clean.
 */
import { body, param, query } from 'express-validator';

export const sanitizeString = (field) => 
  body(field).trim().escape().stripLow();

export const sanitizeEmail = (field) => 
  body(field).trim().notEmpty().isEmail().normalizeEmail();

export const sanitizeParamId = (field = 'id') => 
  param(field).trim().notEmpty().isInt().toInt();
