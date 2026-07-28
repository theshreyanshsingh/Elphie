export function isBillingAvailable(deploymentMode: string | null | undefined): boolean {
  return Boolean(deploymentMode && deploymentMode !== "oss");
}
