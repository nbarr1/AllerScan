// Guards for lookup tables whose keys come from outside the app.
//
// Allergen ids arrive from the query string (`/api/pollen-aqi?userAllergens=…`), from
// localStorage, and from the identifying model's response. They are used as computed property
// keys on plain objects, which has two failure modes:
//
//   - `table[id] = value` with an id of `__proto__` invokes the `__proto__` setter and reparents
//     the table to an attacker-supplied object. Later reads of keys that object happens to define
//     then return attacker-chosen values. (It does not reach `Object.prototype` in this shape,
//     but it does corrupt the lookup.)
//   - `table[id]` with an id of `constructor` (or `toString`, `valueOf`, …) returns an inherited
//     function rather than undefined, so a `if (table[id])` guard passes and downstream code gets
//     a function where it expected data.
//
// Dropping these keys at ingest closes both, and costs nothing: no real allergen id looks like
// this, and user-created custom ids are already prefixed with `custom_`.

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function isSafeObjectKey(key: string): boolean {
  return !UNSAFE_KEYS.has(key);
}

/**
 * Copies `source` into a null-prototype object, dropping unsafe keys. The result inherits
 * nothing, so a lookup miss is always `undefined` rather than an inherited member.
 */
export function withSafeKeys<T>(source: Record<string, T> | null | undefined): Record<string, T> {
  const safe = Object.create(null) as Record<string, T>;
  if (!source || typeof source !== 'object') return safe;

  // Object.entries only walks own enumerable properties, and JSON.parse stores a literal
  // "__proto__" member as an own property — so an injected key is visible here and filtered.
  for (const [key, value] of Object.entries(source)) {
    if (isSafeObjectKey(key)) safe[key] = value;
  }
  return safe;
}

/** An empty lookup table that inherits nothing. */
export function emptySafeTable<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}
