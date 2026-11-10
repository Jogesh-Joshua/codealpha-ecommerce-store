/**
 * src/validators/auth.js
 *
 * Input validation for registration and authentication (§4.7, §6.2, SEC-09, UT-04, API-33, API-35, API-38, API-41).
 *
 * Enforces:
 * - Strict object validation rejecting unknown fields (e.g. role, isAdmin, confirmPassword).
 * - Exact field error messages matching Contract §4.7.
 * - Password length checked in characters (min 8) and UTF-8 bytes (max 72).
 * - Rejection of password matching email.
 */

import { z } from 'zod';

const CONTROL_CHARS_REGEX = /[\x00-\x1F\x7F]/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const registerSchema = z
  .object({
    name: z.string(),
    email: z.string(),
    password: z.string(),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.string(),
    password: z.string(),
  })
  .strict();

/**
 * Validate and normalize registration input body.
 *
 * @param {unknown} body
 * @returns {{ name: string, email: string, password: string }}
 */
export function validateRegister(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    const err = new Error('Request body must be a JSON object.');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    err.fields = { _root: 'Request body must be a JSON object.' };
    throw err;
  }

  const fields = {};
  const allowedKeys = new Set(['name', 'email', 'password']);

  // Strict check: reject unknown fields (e.g. confirmPassword, role, isAdmin)
  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) {
      fields[key] = `Unknown field: ${key}.`;
    }
  }

  // 1. Name validation
  let name = body.name;
  if (typeof name !== 'string') {
    fields.name = 'Enter your name.';
  } else {
    name = name.trim();
    if (name.length < 1 || name.length > 80 || CONTROL_CHARS_REGEX.test(name)) {
      fields.name = 'Enter your name.';
    }
  }

  // 2. Email validation
  let email = body.email;
  if (typeof email !== 'string') {
    fields.email = 'Enter a valid email address, like name@example.com.';
  } else {
    email = email.trim().toLowerCase();
    if (email.length < 3 || email.length > 254 || !EMAIL_REGEX.test(email)) {
      fields.email = 'Enter a valid email address, like name@example.com.';
    }
  }

  // 3. Password validation
  const password = body.password;
  if (typeof password !== 'string') {
    fields.password = 'Use at least 8 characters.';
  } else {
    if (password.length < 8) {
      fields.password = 'Use at least 8 characters.';
    } else if (Buffer.byteLength(password, 'utf8') > 72) {
      fields.password = 'Use 72 characters or fewer.';
    } else if (typeof body.email === 'string' && (password === body.email || password.toLowerCase() === email)) {
      fields.password = 'Password cannot equal email.';
    }
  }

  if (Object.keys(fields).length > 0) {
    const err = new Error('Some fields need attention.');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    err.fields = fields;
    throw err;
  }

  return { name, email, password };
}

/**
 * Validate and normalize login input body.
 *
 * @param {unknown} body
 * @returns {{ email: string, password: string }}
 */
export function validateLogin(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    const err = new Error('Request body must be a JSON object.');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    err.fields = { _root: 'Request body must be a JSON object.' };
    throw err;
  }

  const fields = {};
  const allowedKeys = new Set(['email', 'password']);

  // Strict check: reject unknown fields
  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) {
      fields[key] = `Unknown field: ${key}.`;
    }
  }

  if (typeof body.email !== 'string' || body.email.trim() === '') {
    fields.email = 'Enter a valid email address, like name@example.com.';
  }

  if (typeof body.password !== 'string' || body.password === '') {
    fields.password = 'Enter your password.';
  }

  if (Object.keys(fields).length > 0) {
    const err = new Error('Some fields need attention.');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    err.fields = fields;
    throw err;
  }

  return {
    email: body.email.trim().toLowerCase(),
    password: body.password,
  };
}

