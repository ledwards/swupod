// @ts-nocheck
/**
 * User and authentication type definitions
 */

// === USER TYPES ===

/**
 * User object from database
 */
export interface User {
  id: string;
  email: string | null;
  discordId: string | null;
  googleId: string | null;
  username: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  isBetaTester: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User object as stored in database (snake_case)
 */
export interface UserRow {
  id: string;
  email: string | null;
  discord_id: string | null;
  google_id: string | null;
  username: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  is_beta_tester: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Convert database row to User object
 */
export function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    discordId: row.discord_id,
    googleId: row.google_id,
    username: row.username,
    avatarUrl: row.avatar_url,
    isAdmin: row.is_admin,
    isBetaTester: row.is_beta_tester,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// === JWT TYPES ===

/**
 * JWT token payload
 */
export interface JWTPayload {
  id: string;
  email: string;
  username: string;
  avatarUrl: string;
  isAdmin: boolean;
  isBetaTester: boolean;
  /** Issued at timestamp */
  iat: number;
  /** Expiration timestamp */
  exp: number;
}

/**
 * Session object (decoded JWT payload)
 */
export interface Session {
  id: string;
  email: string;
  username: string;
  avatarUrl: string;
  isAdmin: boolean;
  isBetaTester: boolean;
}

// === AUTH CONTEXT ===

/**
 * Authentication context provided by AuthContext
 */
export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isPatron: boolean | null;
  patronMessage: string | null;
  isAuthenticated: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  enrollBeta: () => Promise<boolean>;
  refreshSession: () => Promise<boolean>;
  refreshPatronStatus: () => Promise<{
    isPatron: boolean;
    pendingPatreon?: boolean;
    message?: string;
  }>;
}

// === AUTH HELPERS ===

/**
 * Check if user has beta access (is beta tester or admin)
 */
export function hasBetaAccess(user: User | null): boolean {
  if (!user) return false;
  return user.isBetaTester || user.isAdmin;
}

/**
 * Check if user is admin
 */
export function isAdmin(user: User | null): boolean {
  if (!user) return false;
  return user.isAdmin;
}
