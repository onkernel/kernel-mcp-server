// Shared types and interfaces for language-specific dependency resolvers

export interface DependencyInfo {
  discoveredPackages: string[];
  dependencies: Record<string, string>;
}

export interface ProjectFiles {
  [filename: string]: string;
}

export interface LanguageResolver {
  // Extract package names from import/require statements
  extractImports(code: string): string[];

  // Lookup package version from registry
  lookupPackageVersion(packageName: string): Promise<string>;

  // Resolve all dependencies for a source file
  resolveDependencies(
    code: string, 
    providedDependencies?: Record<string, string>
  ): Promise<DependencyInfo>;

  // Generate project configuration files
  generateProjectFiles(
    filename: string,
    entrypointRelPath: string,
    dependencies: Record<string, string>,
  ): ProjectFiles;

  // Merge auto-discovered and user-provided dependencies
  mergeDependencies(
    autoDependencies: Record<string, string>,
    providedDependencies?: Record<string, string>,
  ): Record<string, string>;
}

export interface DeploymentConfig {
  filename: string;
  code: string;
  entrypointRelPath: string;
  dependencies?: Record<string, string>;
}

export type SupportedLanguage = "typescript" | "python";

// Language detection utilities
export function detectLanguage(filename: string): SupportedLanguage {
  const ext = filename.toLowerCase().split(".").pop();

  switch (ext) {
    case "ts":
    case "tsx":
      return "typescript";
    case "py":
      return "python";
    default:
      throw new Error(`Unsupported file extension: .${ext}`);
  }
}
