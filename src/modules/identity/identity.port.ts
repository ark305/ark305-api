export type Principal = { id: string };

export abstract class IdentityPort {
  abstract verify(token: string): Promise<Principal | null>;
}
