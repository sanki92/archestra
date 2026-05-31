export interface WindmillConfig {
  baseUrl: string;
  workspace: string;
  token: string;
}

export function getWindmillConfig(
  env: NodeJS.ProcessEnv = process.env,
): WindmillConfig | null {
  const baseUrl = env.WINDMILL_BASE_URL?.trim();
  const workspace = env.WINDMILL_WORKSPACE?.trim();
  const token = env.WINDMILL_TOKEN?.trim();

  if (!baseUrl || !workspace || !token) {
    return null;
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    workspace,
    token,
  };
}
