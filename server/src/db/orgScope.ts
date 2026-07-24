import { HttpError } from "../errors/httpError.js";

export type OrganizationContext = {
  organizationId: number;
};

export const requireOrganizationId = (
  value: number | null | undefined
): number => {
  if (!value) {
    throw new HttpError(400, "No organization selected");
  }
  return value;
};

export const assertSameOrganization = (
  expectedOrganizationId: number,
  actualOrganizationId: number | null | undefined
): void => {
  if (actualOrganizationId !== expectedOrganizationId) {
    throw new HttpError(404, "Resource not found");
  }
};
