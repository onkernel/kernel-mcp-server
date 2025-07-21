import {
  LanguageResolver,
  DependencyInfo,
  ProjectFiles,
  SupportedLanguage,
  detectLanguage,
  DeploymentConfig,
} from "./resolvers/types";
import { TypeScriptResolver } from "./resolvers/typescript";
import { PythonResolver } from "./resolvers/python";

// Factory function to get the appropriate resolver for a language
function getResolver(language: SupportedLanguage): LanguageResolver {
  switch (language) {
    case "typescript":
      return new TypeScriptResolver();
    case "python":
      return new PythonResolver();
    default:
      throw new Error(`Unsupported language: ${language}`);
  }
}

/**
 * Resolve dependencies across multiple source files
 * Aggregates all imports and deduplicates packages across all files
 */
export async function resolveDependencies(
  files: Record<string, string>,
  providedDependencies: Record<string, string> = {},
): Promise<DependencyInfo> {
  const allDiscoveredPackages = new Set<string>();
  const allDependencies: Record<string, string> = {};

  // Process each file and collect dependencies
  for (const [filename, code] of Object.entries(files)) {
    try {
      const language = detectLanguage(filename);
      const resolver = getResolver(language);

      const { discoveredPackages, dependencies } =
        await resolver.resolveDependencies(code, providedDependencies);

      // Aggregate results
      discoveredPackages.forEach((pkg) => allDiscoveredPackages.add(pkg));
      Object.assign(allDependencies, dependencies);
    } catch (error) {
      console.warn(`Skipping dependency resolution for ${filename}:`, error);
    }
  }

  return {
    discoveredPackages: Array.from(allDiscoveredPackages),
    dependencies: allDependencies,
  };
}

/**
 * Detect the entrypoint file from a collection of files
 * Uses common naming conventions to find the main entry point
 */
export function detectEntrypoint(
  files: Record<string, string>,
  explicitEntrypoint?: string,
): string {
  if (explicitEntrypoint) {
    if (!(explicitEntrypoint in files)) {
      throw new Error(
        `Specified entrypoint "${explicitEntrypoint}" not found in files`,
      );
    }
    return explicitEntrypoint;
  }

  const fileKeys = Object.keys(files);
  if (fileKeys.length === 0) {
    throw new Error("No files provided");
  }

  // Priority order for entrypoint detection
  const entrypointCandidates = [
    "index.ts",
    "src/index.ts",
    "app/index.ts",
    "main.ts",
    "src/main.ts",
    "app/main.ts",
    "index.py",
    "src/index.py",
    "app/index.py",
    "main.py",
    "src/main.py",
    "app/main.py",
  ];

  // Check exact matches first
  for (const candidate of entrypointCandidates) {
    if (files[candidate]) {
      return candidate;
    }
  }

  // Fallback: find any file matching entrypoint pattern
  for (const filePath of fileKeys) {
    const basename = filePath.split("/").pop() || "";
    if (/^(index|main)\.(ts|py)$/.test(basename)) {
      return filePath;
    }
  }

  // Final fallback: use first file
  return fileKeys[0];
}

/**
 * Generate project configuration files based on detected language
 */
export function generateProjectFiles(
  entrypointPath: string,
  dependencies: Record<string, string>,
): ProjectFiles {
  const language = detectLanguage(entrypointPath);
  const resolver = getResolver(language);
  return resolver.generateProjectFiles(
    entrypointPath,
    entrypointPath,
    dependencies,
  );
}

/**
 * Merge auto-discovered and user-provided dependencies
 * User-provided dependencies take precedence over auto-discovered ones
 */
export function mergeDependencies(
  autoDependencies: Record<string, string>,
  providedDependencies: Record<string, string> = {},
  entrypointPath?: string,
): Record<string, string> {
  if (entrypointPath) {
    const language = detectLanguage(entrypointPath);
    const resolver = getResolver(language);
    return resolver.mergeDependencies(autoDependencies, providedDependencies);
  }

  return { ...autoDependencies, ...providedDependencies };
}

export type {
  LanguageResolver,
  DependencyInfo,
  ProjectFiles,
  SupportedLanguage,
  DeploymentConfig,
};
export { detectLanguage };
