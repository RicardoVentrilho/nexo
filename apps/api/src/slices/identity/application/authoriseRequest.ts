export type Role = "user" | "administrator";

export interface Principal {
  subject: string;
  displayName: string;
  roles: Role[];
}

export function authoriseRequest(principal: Principal, allowedRoles: Role[] = ["user", "administrator"]): void {
  if (!principal.roles.some((role) => allowedRoles.includes(role))) {
    throw Object.assign(new Error("forbidden"), { statusCode: 403 });
  }
}
