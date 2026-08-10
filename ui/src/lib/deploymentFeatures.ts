/** True for self-hosted installs (includes legacy "oss" mode from older APIs). */
export function isSelfHostedDeployment(
  deploymentMode: string | null | undefined,
): boolean {
  return deploymentMode === "selfhosted" || deploymentMode === "oss";
}

export function isBillingAvailable(
  deploymentMode: string | null | undefined,
): boolean {
  return Boolean(deploymentMode && !isSelfHostedDeployment(deploymentMode));
}
