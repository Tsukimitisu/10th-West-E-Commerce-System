import { validationResult, matchedData } from 'express-validator';

export const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    // Validation feedback must never echo submitted passwords or action tokens.
    const rawErrors = errors.array().map(error => ({ type: error.type, path: error.path, location: error.location, msg: error.msg }));
    const fieldErrors = rawErrors.reduce((acc, error) => {
      if (error.type === 'field' && error.path && !acc[error.path]) {
        acc[error.path] = error.msg;
      }
      return acc;
    }, {});

    const firstMessage = rawErrors.find((error) => typeof error.msg === 'string' && error.msg.trim())?.msg;

    return res.status(400).json({ 
      message: firstMessage || 'Validation failed', 
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
