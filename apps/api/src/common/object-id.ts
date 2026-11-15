const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

/** MongoDB's ObjectId.isValid also accepts arbitrary 12-char strings; the contract does not. */
export function isObjectIdString(value: unknown): value is string {
  return typeof value === 'string' && OBJECT_ID_PATTERN.test(value);
}
