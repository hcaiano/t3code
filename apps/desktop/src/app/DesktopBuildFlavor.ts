export type DesktopBuildFlavor = "official" | "pair";

export const DEFAULT_DESKTOP_BUILD_FLAVOR: DesktopBuildFlavor = "official";
export const PAIR_DESKTOP_BUILD_FLAVOR: DesktopBuildFlavor = "pair";

export function resolveDesktopBuildFlavor(value: unknown): DesktopBuildFlavor {
  return value === PAIR_DESKTOP_BUILD_FLAVOR
    ? PAIR_DESKTOP_BUILD_FLAVOR
    : DEFAULT_DESKTOP_BUILD_FLAVOR;
}

export function readDesktopBuildFlavor(
  appPath: string,
  readFileString: (path: string) => string,
  joinPath: (first: string, ...segments: string[]) => string,
): DesktopBuildFlavor {
  try {
    const packageJson = JSON.parse(readFileString(joinPath(appPath, "package.json"))) as {
      readonly t3codeDesktopFlavor?: unknown;
    };
    return resolveDesktopBuildFlavor(packageJson.t3codeDesktopFlavor);
  } catch {
    return DEFAULT_DESKTOP_BUILD_FLAVOR;
  }
}
