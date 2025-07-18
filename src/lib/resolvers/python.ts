import { LanguageResolver, DependencyInfo, ProjectFiles } from "./types";

// Python built-in modules (comprehensive list based on Python 3.12+ documentation)
// This includes the standard library modules that come with Python
const PYTHON_BUILTINS = new Set([
  // Built-in types and functions
  "__main__",
  "__future__",
  "_thread",
  "abc",
  "argparse",
  "array",
  "ast",
  "asyncio",
  "atexit",
  "base64",
  "bdb",
  "binascii",
  "bisect",
  "builtins",
  "bz2",
  "calendar",
  "cmath",
  "cmd",
  "code",
  "codecs",
  "codeop",
  "collections",
  "colorsys",
  "compileall",
  "concurrent",
  "configparser",
  "contextlib",
  "contextvars",
  "copy",
  "copyreg",
  "csv",
  "ctypes",
  "curses",
  "dataclasses",
  "datetime",
  "dbm",
  "decimal",
  "difflib",
  "dis",
  "doctest",
  "email",
  "encodings",
  "ensurepip",
  "enum",
  "errno",
  "faulthandler",
  "fcntl",
  "filecmp",
  "fileinput",
  "fnmatch",
  "fractions",
  "ftplib",
  "functools",
  "gc",
  "getopt",
  "getpass",
  "gettext",
  "glob",
  "graphlib",
  "grp",
  "gzip",
  "hashlib",
  "heapq",
  "hmac",
  "html",
  "http",
  "idlelib",
  "imaplib",
  "importlib",
  "inspect",
  "io",
  "ipaddress",
  "itertools",
  "json",
  "keyword",
  "linecache",
  "locale",
  "logging",
  "lzma",
  "mailbox",
  "marshal",
  "math",
  "mimetypes",
  "mmap",
  "modulefinder",
  "msvcrt",
  "multiprocessing",
  "netrc",
  "numbers",
  "operator",
  "optparse",
  "os",
  "pathlib",
  "pdb",
  "pickle",
  "pickletools",
  "pkgutil",
  "platform",
  "plistlib",
  "poplib",
  "posix",
  "pprint",
  "profile",
  "pstats",
  "pty",
  "pwd",
  "py_compile",
  "pyclbr",
  "pydoc",
  "queue",
  "quopri",
  "random",
  "re",
  "readline",
  "reprlib",
  "resource",
  "rlcompleter",
  "runpy",
  "sched",
  "secrets",
  "select",
  "selectors",
  "shelve",
  "shlex",
  "shutil",
  "signal",
  "site",
  "sitecustomize",
  "smtplib",
  "socket",
  "socketserver",
  "sqlite3",
  "ssl",
  "stat",
  "statistics",
  "string",
  "stringprep",
  "struct",
  "subprocess",
  "symtable",
  "sys",
  "sysconfig",
  "syslog",
  "tabnanny",
  "tarfile",
  "tempfile",
  "termios",
  "test",
  "textwrap",
  "threading",
  "time",
  "timeit",
  "tkinter",
  "tomllib",
  "trace",
  "traceback",
  "tracemalloc",
  "turtle",
  "types",
  "typing",
  "unicodedata",
  "unittest",
  "urllib",
  "uuid",
  "venv",
  "warnings",
  "wave",
  "weakref",
  "webbrowser",
  "winreg",
  "winsound",
  "wsgiref",
  "xml",
  "xmlrpc",
  "zipapp",
  "zipfile",
  "zipimport",
  "zlib",
  "zoneinfo",

  // Common submodules that might be imported directly
  "collections.abc",
  "concurrent.futures",
  "email.mime",
  "html.parser",
  "http.client",
  "http.server",
  "importlib.metadata",
  "importlib.resources",
  "json.tool",
  "logging.config",
  "logging.handlers",
  "multiprocessing.pool",
  "os.path",
  "urllib.parse",
  "urllib.request",
  "xml.etree",
  "xml.etree.ElementTree",
]);

export class PythonResolver implements LanguageResolver {
  /**
   * Extract package names from Python import statements
   */
  extractImports(code: string): string[] {
    const imports = new Set<string>();

    // Regex patterns for different Python import styles
    const patterns = [
      // import module
      /^import\s+([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)/gm,
      // from module import ...
      /^from\s+([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)\s+import/gm,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        const moduleName = match[1];

        // Skip relative imports (starting with .)
        if (moduleName.startsWith(".")) {
          continue;
        }

        // Get the top-level package name
        const topLevelPackage = moduleName.split(".")[0];

        // Skip Python built-in modules
        if (
          !PYTHON_BUILTINS.has(topLevelPackage) &&
          !PYTHON_BUILTINS.has(moduleName)
        ) {
          imports.add(topLevelPackage);
        }
      }
    }

    return Array.from(imports);
  }

  /**
   * Lookup package version from PyPI registry
   */
  async lookupPackageVersion(packageName: string): Promise<string> {
    try {
      const response = await fetch(`https://pypi.org/pypi/${packageName}/json`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();

      return `>=${data.info.version}`;
    } catch (error) {
      console.warn(`Failed to lookup version for ${packageName}:`, error);
      // Fallback to latest
      return "*";
    }
  }

  /**
   * Resolve all dependencies for a Python file
   */
  async resolveDependencies(
    code: string,
    providedDependencies?: Record<string, string>,
  ): Promise<DependencyInfo> {
    // Discover dependencies from import statements
    const discoveredPackages = this.extractImports(code);
    const providedPackageNames = new Set(
      Object.keys(providedDependencies || {}),
    );

    // Lookup versions for each package (skip if already provided)
    const dependencies: Record<string, string> = {};
    for (const pkg of discoveredPackages) {
      if (providedPackageNames.has(pkg)) {
        // Skip PyPI lookup if user already provided this package version
        console.log(
          `Skipping PyPI lookup for "${pkg}" - version provided by user`,
        );
        continue;
      }

      try {
        dependencies[pkg] = await this.lookupPackageVersion(pkg);
      } catch (error) {
        console.warn(`Failed to resolve ${pkg}, using latest:`, error);
        dependencies[pkg] = "*";
      }
    }

    return { discoveredPackages, dependencies };
  }

  /**
   * Generate Python project configuration files
   */
  generateProjectFiles(
    filename: string,
    entrypointRelPath: string,
    dependencies: Record<string, string>,
  ): ProjectFiles {
    const projectName = filename
      .replace(/\.py$/, "")
      .replace(/[^a-zA-Z0-9_-]/g, "_");

    // Helper function to ensure proper version constraint formatting
    const formatDependency = (pkg: string, version: string): string => {
      // If version already has a constraint operator, use it as-is
      if (/^[><=~!]/.test(version) || version === "*") {
        return `${pkg}${version}`;
      }
      // If it's a bare version number, add >= prefix
      if (/^\d+\.\d+/.test(version)) {
        return `${pkg}>=${version}`;
      }
      // Default fallback
      return `${pkg}${version}`;
    };

    const pyprojectToml = `[build-system]
requires = ["setuptools>=61.0"]
build-backend = "setuptools.build_meta"

[project]
name = "${projectName}"
version = "1.0.0"
description = "Kernel Python application"
readme = "README.md"
requires-python = ">=3.8"
dependencies = [
${Object.entries(dependencies)
  .map(([pkg, version]) => `    "${formatDependency(pkg, version)}",`)
  .join("\n")}
]
`;

    // Generate a simple README
    const readme = `# ${projectName}

A Python application deployed to Kernel.

## Installation

\`\`\`bash
pip install -e .
\`\`\`

## Usage

\`\`\`bash
python ${entrypointRelPath}
\`\`\`
`;

    return {
      "pyproject.toml": pyprojectToml,
      "README.md": readme,
    };
  }

  /**
   * Merge auto-discovered dependencies with provided dependencies
   * Provided dependencies take priority over auto-discovered ones
   * Preserves exact formatting of provided dependencies
   */
  mergeDependencies(
    autoDependencies: Record<string, string>,
    providedDependencies?: Record<string, string>,
  ): Record<string, string> {
    const normalizedProvidedDeps: Record<string, string> =
      providedDependencies || {};

    // Helper function to ensure version constraint for auto-discovered deps only
    const ensureVersionConstraint = (version: string): string => {
      // If version already has a constraint operator, return as-is
      if (/^[><=~!]/.test(version) || version === "*") {
        return version;
      }
      // If it's a bare version number, add >= prefix for auto-discovered deps
      if (/^\d+\.\d+/.test(version)) {
        return `>=${version}`;
      }
      // Default fallback
      return version;
    };

    // Validate provided dependencies and warn about potential issues
    Object.entries(normalizedProvidedDeps).forEach(([pkg, version]) => {
      if (/^\d+\.\d+/.test(version) && !/^[><=~!]/.test(version)) {
        console.warn(
          `Warning: Package "${pkg}": "${version}" appears to be a bare version number. ` +
            `Python pip expects version constraints like ">=1.0.0", "==1.0.0", "~=1.0.0", etc. ` +
            `If deployment fails, ensure your version matches your pyproject.toml exactly.`,
        );
      }
    });

    const finalDependencies: Record<string, string> = {};

    // Add auto-discovered dependencies with constraints
    Object.entries(autoDependencies).forEach(([pkg, version]) => {
      // Only apply auto-constraints if this package isn't overridden by provided deps
      if (!normalizedProvidedDeps.hasOwnProperty(pkg)) {
        finalDependencies[pkg] = ensureVersionConstraint(version);
      }
    });

    // Add provided dependencies EXACTLY as specified (no modification)
    Object.entries(normalizedProvidedDeps).forEach(([pkg, version]) => {
      finalDependencies[pkg] = version; // Preserve exact format from provided deps
    });

    return finalDependencies;
  }
}
