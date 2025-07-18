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
 * Resolve all dependencies for a source file based on its language
 */
export async function resolveDependencies(
  code: string,
  filename: string,
  providedDependencies?: Record<string, string>,
): Promise<DependencyInfo> {
  const language = detectLanguage(filename);
  const resolver = getResolver(language);
  return resolver.resolveDependencies(code, providedDependencies);
}

/**
 * Generate project configuration files based on language
 */
export function generateProjectFiles(
  filename: string,
  entrypointRelPath: string,
  dependencies: Record<string, string>,
): ProjectFiles {
  const language = detectLanguage(filename);
  const resolver = getResolver(language);
  return resolver.generateProjectFiles(
    filename,
    entrypointRelPath,
    dependencies,
  );
}

/**
 * Merge auto-discovered and provided dependencies
 */
export function mergeDependencies(
  autoDependencies: Record<string, string>,
  providedDependencies?: Record<string, string>,
  filename?: string,
): Record<string, string> {
  if (filename) {
    const language = detectLanguage(filename);
    const resolver = getResolver(language);
    return resolver.mergeDependencies(
      autoDependencies,
      providedDependencies,
    );
  }

  // Fallback to simple merge if no filename provided (backward compatibility)
  const normalizedProvidedDeps: Record<string, string> = providedDependencies || {};
  const finalDependencies: Record<string, string> = {};

  Object.entries(autoDependencies).forEach(([pkg, version]) => {
    finalDependencies[pkg] = version;
  });

  Object.entries(normalizedProvidedDeps).forEach(([pkg, version]) => {
    finalDependencies[pkg] = version;
  });

  return finalDependencies;
}

export type {
  LanguageResolver,
  DependencyInfo,
  ProjectFiles,
  SupportedLanguage,
  DeploymentConfig,
};
export { detectLanguage };
