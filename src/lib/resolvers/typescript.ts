import builtinModules from "builtin-modules";
import { LanguageResolver, DependencyInfo, ProjectFiles } from "./types";

// Node.js built-in modules (don't need to be in package.json)
const NODE_BUILTINS = new Set(builtinModules);

export class TypeScriptResolver implements LanguageResolver {
  /**
   * Extract package names from TypeScript import statements
   */
  extractImports(code: string): string[] {
    const imports = new Set<string>();

    // Regex patterns for different import styles
    const patterns = [
      // import ... from 'pkg'
      /import\s+(?:[\w\s{},*]+\s+from\s+)?['"`]([^'"`]+)['"`]/g,
      // import('pkg')
      /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
      // require('pkg')
      /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        const spec = match[1];

        // Skip relative imports, absolute paths, and Node.js built-ins
        if (
          !spec.startsWith(".") &&
          !spec.startsWith("/") &&
          !NODE_BUILTINS.has(spec) &&
          !NODE_BUILTINS.has(spec.split("/")[0])
        ) {
          // Handle scoped packages (e.g., @onkernel/sdk -> @onkernel/sdk)
          const pkgName = spec.startsWith("@")
            ? spec.split("/").slice(0, 2).join("/")
            : spec.split("/")[0];
          imports.add(pkgName);
        }
      }
    }

    return Array.from(imports);
  }

  /**
   * Lookup package version from npm registry
   */
  async lookupPackageVersion(packageName: string): Promise<string> {
    try {
      const response = await fetch(
        `https://registry.npmjs.org/${packageName}/latest`,
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      return `^${data.version}`;
    } catch (error) {
      console.warn(`Failed to lookup version for ${packageName}:`, error);
      // Fallback to latest
      return "latest";
    }
  }

  /**
   * Resolve all dependencies for a TypeScript file
   */
  async resolveDependencies(
    code: string,
    providedDependencies?: Record<string, string>
  ): Promise<DependencyInfo> {
    // Discover dependencies from import statements
    const discoveredPackages = this.extractImports(code);
    const providedPackageNames = new Set(Object.keys(providedDependencies || {}));

    // Lookup versions for each package (skip if already provided)
    const dependencies: Record<string, string> = {};
    for (const pkg of discoveredPackages) {
      if (providedPackageNames.has(pkg)) {
        // Skip npm lookup if user already provided this package version
        console.log(`Skipping npm lookup for "${pkg}" - version provided by user`);
        continue;
      }

      try {
        dependencies[pkg] = await this.lookupPackageVersion(pkg);
      } catch (error) {
        console.warn(`Failed to resolve ${pkg}, using latest:`, error);
        dependencies[pkg] = "latest";
      }
    }

    return { discoveredPackages, dependencies };
  }

  /**
   * Generate TypeScript project configuration files
   */
  generateProjectFiles(
    filename: string,
    entrypointRelPath: string,
    dependencies: Record<string, string>,
  ): ProjectFiles {
    const packageJson = {
      name: filename.replace(/\.ts$/, ""),
      version: "1.0.0",
      type: "module" as const,
      scripts: {
        start: `bun run ${entrypointRelPath}`,
      },
      peerDependencies: {
        typescript: "^5",
      },
      dependencies,
    };

    const tsConfig = {
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Node",
        strict: true,
        esModuleInterop: true,
        resolveJsonModule: true,
        forceConsistentCasingInFileNames: true,
      },
      include: ["src/**/*"],
    };

    return {
      "package.json": JSON.stringify(packageJson, null, 2),
      "tsconfig.json": JSON.stringify(tsConfig, null, 2),
    };
  }

  /**
   * Merge auto-discovered dependencies with provided dependencies
   * Provided dependencies take priority over auto-discovered ones
   */
  mergeDependencies(
    autoDependencies: Record<string, string>,
    providedDependencies?: Record<string, string>,
  ): Record<string, string> {
    // Normalize provided dependencies to ensure consistent format
    const normalizedProvidedDeps: Record<string, string> =
      providedDependencies || {};

    // Merge dependencies with explicit priority: provided deps override auto-discovered
    const finalDependencies: Record<string, string> = {};

    // Start with auto-discovered dependencies
    Object.entries(autoDependencies).forEach(([pkg, version]) => {
      finalDependencies[pkg] = version;
    });

    // Override with provided dependencies (higher priority)
    Object.entries(normalizedProvidedDeps).forEach(([pkg, version]) => {
      finalDependencies[pkg] = version;
    });

    return finalDependencies;
  }
}
