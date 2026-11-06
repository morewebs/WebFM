import type { FastifyRequest } from "fastify";

export interface AuthUser {
  userId: string;
}

/**
 * Authentication seam. The route layer currently does not enforce auth; it
 * only attaches the resolved user to the request so a hosted provider can be
 * added later without changing project or editor code.
 */
export interface AuthProvider {
  authenticate(request: FastifyRequest): Promise<AuthUser | null>;
}

/** Single-user provider for local development. */
export class LocalAuthProvider implements AuthProvider {
  static readonly LOCAL_USER_ID = "local";

  async authenticate(_request: FastifyRequest): Promise<AuthUser | null> {
    return { userId: LocalAuthProvider.LOCAL_USER_ID };
  }
}

declare module "fastify" {
  interface FastifyRequest {
    user: AuthUser | null;
  }
}
