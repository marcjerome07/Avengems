// MOCK SERVICE — replace the body of these functions with real API calls when the backend is ready.
//
// mockDb is the in-browser stand-in for the database. ONLY files in src/services/ may import it.
// When the real API exists, the service files call fetch() instead and this file can be deleted.
//
// Persistence rules:
//   - Products & settings: in memory (admin edits last until the page is reloaded).
//   - Registered users, placed orders: localStorage (wrapped in try/catch via utils/storage).
//   - Passwords are NEVER stored in plain text; see hashPassword below.

import { products as seedProducts } from '../data/products';
import { demoUsers } from '../data/demoUsers';
import { demoOrders } from '../data/demoOrders';
import { config } from '../data/config';
import { readStorage, writeStorage } from '../utils/storage';

/* ---------------- Helpers ---------------- */

/** Simulated network latency (300–800 ms) so loading states are real. */
export function delay(min = 300, max = 800) {
  const ms = Math.round(min + Math.random() * (max - min));
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Deep copy so callers can never mutate the "database" by accident. */
export function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

/** Error shape every service throws: { code, message } */
export class ServiceError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    Object.assign(this, extra);
  }
}

/**
 * MOCK ONLY. A tiny non-cryptographic hash so plain-text passwords never sit in localStorage.
 * This is NOT secure. The real backend must hash passwords server-side (bcrypt/argon2).
 */
export function hashPassword(password) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  const input = `avengems::${password}`;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `mock$${(h2 >>> 0).toString(16)}${(h1 >>> 0).toString(16)}`;
}

/* ---------------- Products (in memory) ---------------- */

let productTable = clone(seedProducts);

export const productsTable = {
  all: () => productTable,
  find: (id) => productTable.find((p) => p.id === id),
  insert(product) {
    productTable = [product, ...productTable];
    return product;
  },
  update(id, patch) {
    productTable = productTable.map((p) => (p.id === id ? { ...p, ...patch } : p));
    return productTable.find((p) => p.id === id);
  },
  remove(id) {
    productTable = productTable.filter((p) => p.id !== id);
  },
};

/* ---------------- Users (localStorage) ---------------- */

const USERS_KEY = 'users';

function seedUser(u) {
  const { password, ...rest } = u;
  return { ...clone(rest), passwordHash: hashPassword(password) };
}

export const usersTable = {
  all() {
    let users = readStorage(USERS_KEY, null);
    if (!Array.isArray(users)) users = [];
    // Make sure the demo accounts always exist.
    let changed = false;
    demoUsers.forEach((demo) => {
      if (!users.some((u) => u.id === demo.id)) {
        users.push(seedUser(demo));
        changed = true;
      }
    });
    if (changed) writeStorage(USERS_KEY, users);
    return users;
  },
  findByEmail(email) {
    const target = String(email).trim().toLowerCase();
    return this.all().find((u) => u.email.toLowerCase() === target);
  },
  findById(id) {
    return this.all().find((u) => u.id === id);
  },
  insert(user) {
    const users = this.all();
    users.push(user);
    writeStorage(USERS_KEY, users);
    return user;
  },
  update(id, patch) {
    const users = this.all().map((u) => (u.id === id ? { ...u, ...patch } : u));
    writeStorage(USERS_KEY, users);
    return users.find((u) => u.id === id);
  },
};

/* ---------------- Orders (placed: localStorage, demo: memory) ---------------- */

const ORDERS_KEY = 'orders';
let demoOrderTable = clone(demoOrders);

export const ordersTable = {
  placed: () => {
    const list = readStorage(ORDERS_KEY, []);
    return Array.isArray(list) ? list : [];
  },
  all() {
    return [...this.placed(), ...demoOrderTable].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },
  find(id) {
    return this.all().find((o) => o.id === id);
  },
  insert(order) {
    writeStorage(ORDERS_KEY, [order, ...this.placed()]);
    return order;
  },
  update(id, patch) {
    const placed = this.placed();
    if (placed.some((o) => o.id === id)) {
      writeStorage(
        ORDERS_KEY,
        placed.map((o) => (o.id === id ? { ...o, ...patch } : o)),
      );
    } else {
      demoOrderTable = demoOrderTable.map((o) => (o.id === id ? { ...o, ...patch } : o));
    }
    return this.find(id);
  },
};

/* ---------------- Store settings (in memory) ---------------- */

let settings = {
  storeName: config.storeName,
  contactEmail: config.contactEmail,
  shippingFee: config.shipping.flatFee,
  freeShippingThreshold: config.shipping.freeThreshold,
};

export const settingsTable = {
  get: () => settings,
  set(patch) {
    settings = { ...settings, ...patch };
    return settings;
  },
};
