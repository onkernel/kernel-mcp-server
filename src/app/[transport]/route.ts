import {
  createMcpHandler,
  experimental_withMcpAuth as withMcpAuth,
} from "@vercel/mcp-adapter";
import { verifyToken } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { Kernel } from "@onkernel/sdk";
import { z } from "zod";
import { promises as fs, createReadStream } from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import JSZip from "jszip";
import {
  resolveDependencies,
  generateProjectFiles,
  mergeDependencies,
  detectEntrypoint,
} from "@/lib/dependency-resolver";
import { AppAction } from "@onkernel/sdk/resources";

function createKernelClient(apiKey: string) {
  return new Kernel({
    apiKey,
    baseURL: process.env.API_BASE_URL,
    defaultHeaders: {
      "X-Source": "mcp-server",
      "X-Referral-Source": "mcp.onkernel.com",
    },
  });
}

export async function OPTIONS(_req: NextRequest): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

// Helper function to create authentication error response
function createAuthErrorResponse(
  error: string = "invalid_token",
  description: string = "Missing or invalid access token",
): Response {
  return new Response(
    JSON.stringify({
      error,
      error_description: description,
    }),
    {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer realm="OAuth", error="${error}", error_description="${description}"`,
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    },
  );
}

// Create MCP handler with tools
const handler = createMcpHandler((server) => {
  // Search Docs Tool
  server.tool(
    "search_docs",
    "Search through comprehensive Kernel platform documentation to find relevant information, guides, tutorials, and API references. Use this tool when you need to understand how Kernel features work, troubleshoot issues, or provide accurate information about the platform capabilities.",
    {
      query: z
        .string()
        .describe(
          'Search query to find relevant documentation. Use natural language like "how to deploy an app" or "browser automation examples"',
        ),
    },
    async ({ query }, extra) => {
      if (!process.env.MINTLIFY_API_TOKEN) {
        console.error("MINTLIFY_API_TOKEN environment variable is not set");
        return {
          content: [
            {
              type: "text",
              text: "Error: MINTLIFY_API_TOKEN environment variable is not set",
            },
          ],
        };
      }

      // Check if query is provided
      if (!query) {
        console.error("No query provided to search_docs tool");
        return {
          content: [
            {
              type: "text",
              text: "Error: No query provided for documentation search",
            },
          ],
        };
      }

      const mintlifyBaseUrl = "https://api-dsc.mintlify.com/v1";
      const domain = "docs.onkernel.com";
      const fingerprint = extra.authInfo?.extra?.userId || "anonymous";
      const headers = {
        Authorization: `Bearer ${process.env.MINTLIFY_API_TOKEN}`,
        "Content-Type": "application/json",
      };

      try {
        // Generate a unique message ID
        const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Send the search query to Mintlify's new assistant API
        const messageResponse = await fetch(
          `${mintlifyBaseUrl}/assistant/${domain}/message`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              messages: [
                {
                  id: messageId,
                  role: "user",
                  content: query,
                  parts: [
                    {
                      type: "text",
                      text: query,
                    },
                  ],
                },
              ],
              fp: fingerprint,
              retrievalPageSize: 5,
            }),
          },
        );

        if (!messageResponse.ok) {
          console.error(
            `Failed to send message: ${messageResponse.status} ${messageResponse.statusText}`,
          );
          throw new Error(
            `Failed to send message: ${messageResponse.status} ${messageResponse.statusText}`,
          );
        }

        const responseText = await messageResponse.text();

        // Parse the streaming response format from Mintlify
        // Lines starting with '0:' contain the actual text content
        const textLines = responseText
          .split("\n")
          .filter((line) => line.startsWith('0:"'))
          .map((line) => {
            // Extract text between quotes, handling escaped quotes
            const match = line.match(/^0:"(.*)"/);
            if (match) {
              // Unescape the JSON string
              return JSON.parse('"' + match[1] + '"');
            }
            return "";
          })
          .filter((text) => text.length > 0);

        const cleanText = textLines.join("");

        return {
          content: [
            {
              type: "text",
              text: cleanText || "No results found for your query.",
            },
          ],
        };
      } catch (error) {
        console.error("Error searching documentation:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error searching documentation: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  );

  // List Apps Tool
  server.tool(
    "list_apps",
    "List all apps deployed in the Kernel platform. Use this to discover available apps, check their versions, or filter by specific criteria. Helpful for understanding what apps are available before invoking actions.",
    {
      app_name: z
        .string()
        .describe(
          'Filter results to show only apps with this exact name (e.g., "my-web-scraper")',
        )
        .optional(),
      version: z
        .string()
        .describe(
          'Filter results to show only apps with this exact version label (e.g., "v1.0.0", "latest")',
        )
        .optional(),
    },
    async ({ app_name, version }, extra) => {
      if (!extra.authInfo) {
        throw new Error("Authentication required");
      }

      const client = createKernelClient(extra.authInfo.token);

      try {
        const result = await client.apps.list({
          ...(app_name && { app_name: app_name }),
          ...(version && { version: version }),
        });

        return {
          content: [
            {
              type: "text",
              text: result
                ? JSON.stringify({ apps: result }, null, 2)
                : "No apps found",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching apps: ${error}`,
            },
          ],
        };
      }
    },
  );

  // Invoke Action Tool
  server.tool(
    "invoke_action",
    "Execute a specific action within a Kernel app. This is the primary way to interact with deployed apps - use this to trigger workflows, run computations, or perform operations. The action will run asynchronously and you can track its progress with the returned invocation ID.",
    {
      app_name: z
        .string()
        .describe(
          'Name of the Kernel app (e.g., "my-web-scraper", "data-processor")',
        ),
      action_name: z
        .string()
        .describe(
          'Name of the specific action to invoke within the app (e.g., "scrape_website", "process_data")',
        ),
      payload: z
        .string()
        .describe(
          "JSON string containing parameters for the action. Format depends on the specific action being invoked.",
        )
        .optional(),
      version: z
        .string()
        .describe("Specific version of the app to use")
        .optional(),
    },
    async ({ app_name, action_name, payload, version }, extra) => {
      if (!extra.authInfo) {
        throw new Error("Authentication required");
      }

      const client = createKernelClient(extra.authInfo.token);

      try {
        // Create the invocation
        const invocation = await client.invocations.create({
          app_name: app_name,
          action_name: action_name,
          payload: payload,
          version: version ?? "latest",
          async: true,
        });

        if (!invocation) {
          throw new Error("Failed to create invocation");
        }

        const stream = await client.invocations.follow(invocation.id);
        let finalResult = invocation;

        for await (const evt of stream) {
          switch (evt.event) {
            case "error":
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        status: "error",
                        message: "An error occurred during invocation",
                        invocation_id: invocation.id,
                        error: evt,
                      },
                      null,
                      2,
                    ),
                  },
                ],
              };

            case "invocation_state":
              finalResult = evt.invocation || finalResult;

              // Break out of the loop when invocation is complete or failed
              if (
                finalResult.status === "succeeded" ||
                finalResult.status === "failed"
              ) {
                break;
              }
              break;

            case "log":
              // Ignore logs for now
              break;

            default:
              break;
          }

          // Exit the loop if invocation is in a final state
          if (
            finalResult.status === "succeeded" ||
            finalResult.status === "failed"
          ) {
            break;
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(finalResult, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error invoking action: ${error}`,
            },
          ],
        };
      }
    },
  );

  // Get Browser Tool
  server.tool(
    "get_browser",
    "Retrieve detailed information about a specific browser session including its current status, configuration, and metadata. Use this to check if a browser is still active, get its access URLs, or understand its current state before performing operations.",
    {
      id: z
        .string()
        .describe(
          "Unique identifier of the browser session to retrieve information about. You can get this from list_browsers or create_browser responses.",
        ),
    },
    async ({ id }, extra) => {
      if (!extra.authInfo) {
        throw new Error("Authentication required");
      }

      const client = createKernelClient(extra.authInfo.token);

      try {
        const result = await client.browsers.retrieve(id);

        return {
          content: [
            {
              type: "text",
              text: result
                ? JSON.stringify(result, null, 2)
                : "Browser session not found",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching browser: ${error}`,
            },
          ],
        };
      }
    },
  );

  // Create Browser Tool
  server.tool(
    "create_browser",
    "Launch a new browser session in the Kernel platform. This creates a managed browser instance that can be used for web automation, testing, or interactive browsing. The browser runs in a secure sandbox environment and can be configured with various options like headless mode, stealth mode, and session recording.",
    {
      headless: z
        .boolean()
        .describe(
          "If true, launches the browser without GUI/VNC access (faster, less resource intensive). Use false for interactive browsing or debugging.",
        )
        .optional(),
      invocation_id: z
        .string()
        .describe(
          "Link this browser session to a specific action invocation for tracking and resource management.",
        )
        .optional(),
      persistence_id: z
        .string()
        .describe(
          "Unique string identifier for browser session persistence. If a browser with this ID exists, Kernel reuses it with all saved state (cookies, authentication, cache). If not found, creates a new browser with this ID for future reuse. Can be any string to match users, environments, websites, etc.",
        )
        .optional(),
      replay: z
        .boolean()
        .describe(
          "If true, records all browser interactions for later playback and analysis. Useful for debugging automation scripts.",
        )
        .optional(),
      stealth: z
        .boolean()
        .describe(
          "If true, configures browser to avoid detection by anti-bot systems. Recommended for web scraping and automation.",
        )
        .optional(),
    },
    async (
      { headless, invocation_id, persistence_id, replay, stealth },
      extra,
    ) => {
      if (!extra.authInfo) {
        throw new Error("Authentication required");
      }

      const client = createKernelClient(extra.authInfo.token);

      try {
        const result = await client.browsers.create({
          ...(headless && { headless: headless }),
          ...(invocation_id && { invocation_id: invocation_id }),
          ...(persistence_id && { persistence: { id: persistence_id } }),
          ...(replay && { replay: replay }),
          ...(stealth && { stealth: stealth }),
        });

        return {
          content: [
            {
              type: "text",
              text: result
                ? JSON.stringify(result, null, 2)
                : "Failed to create browser session",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error creating browser: ${error}`,
            },
          ],
        };
      }
    },
  );

  // Delete Browser Tool
  server.tool(
    "delete_browser",
    "Permanently terminate and clean up a browser session. This will stop the browser instance, free up resources, and remove any associated data. Use this when you no longer need a browser session or want to clean up after completing automation tasks.",
    {
      persistence_id: z
        .string()
        .describe(
          "Unique string identifier for browser session persistence. This is the same ID used when creating browsers to maintain state across sessions. You can find this value in the persistence.id field from list_browsers responses.",
        ),
    },
    async ({ persistence_id }, extra) => {
      if (!extra.authInfo) {
        throw new Error("Authentication required");
      }

      const client = createKernelClient(extra.authInfo.token);

      try {
        await client.browsers.delete({
          persistent_id: persistence_id,
        });

        return {
          content: [
            {
              type: "text",
              text: "Browser session deleted successfully",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error deleting browser: ${error}`,
            },
          ],
        };
      }
    },
  );

  // Get Deployment Tool
  server.tool(
    "get_deployment",
    "Retrieve comprehensive information about a specific deployment including its current status, build logs, configuration, and health metrics. Use this to monitor deployment progress, troubleshoot deployment issues, or verify that an app was deployed successfully.",
    {
      id: z
        .string()
        .describe(
          "Unique identifier of the deployment to retrieve information about. You can get this from list_deployments responses.",
        ),
    },
    async ({ id }, extra) => {
      if (!extra.authInfo) {
        throw new Error("Authentication required");
      }

      const client = createKernelClient(extra.authInfo.token);

      try {
        const result = await client.deployments.retrieve(id);

        return {
          content: [
            {
              type: "text",
              text: result
                ? JSON.stringify(result, null, 2)
                : "Deployment not found",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching deployment: ${error}`,
            },
          ],
        };
      }
    },
  );

  // Get Invocation Tool
  server.tool(
    "get_invocation",
    "Retrieve detailed information about a specific action invocation including its execution status, output data, error messages, and runtime metrics. Use this to check if an invoked action completed successfully, get its results, or troubleshoot failed executions.",
    {
      id: z
        .string()
        .describe(
          "Unique identifier of the action invocation to retrieve information about. You get this from invoke_action responses.",
        ),
    },
    async ({ id }, extra) => {
      if (!extra.authInfo) {
        throw new Error("Authentication required");
      }

      const client = createKernelClient(extra.authInfo.token);

      try {
        const result = await client.invocations.retrieve(id);

        return {
          content: [
            {
              type: "text",
              text: result
                ? JSON.stringify(result, null, 2)
                : "Invocation not found",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching invocation: ${error}`,
            },
          ],
        };
      }
    },
  );

  // List Browsers Tool
  server.tool(
    "list_browsers",
    "Retrieve a list of all currently active browser sessions in the Kernel platform. This shows you which browsers are running, their session IDs, creation times, and basic configuration. Use this to discover existing browser sessions before creating new ones or to audit current browser usage.",
    {},
    async (_args, extra) => {
      if (!extra.authInfo) {
        throw new Error("Authentication required");
      }

      const client = createKernelClient(extra.authInfo.token);

      try {
        const result = await client.browsers.list();

        return {
          content: [
            {
              type: "text",
              text: result
                ? JSON.stringify(result, null, 2)
                : "No browsers found",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching browsers: ${error}`,
            },
          ],
        };
      }
    },
  );

  // List Deployments Tool
  server.tool(
    "list_deployments",
    "Retrieve a comprehensive list of all deployments in the Kernel platform, with optional filtering by app name. This provides an overview of deployment history, current status, and allows you to track the deployment lifecycle of your apps. Use this to monitor deployment activity or find specific deployments.",
    {
      app_name: z
        .string()
        .describe(
          'Filter results to show only deployments for this specific app name (e.g., "my-web-scraper")',
        ),
    },
    async ({ app_name }, extra) => {
      if (!extra.authInfo) {
        throw new Error("Authentication required");
      }

      const client = createKernelClient(extra.authInfo.token);

      try {
        const result = await client.deployments.list({
          ...(app_name && { app_name: app_name }),
        });

        return {
          content: [
            {
              type: "text",
              text: result
                ? JSON.stringify(result, null, 2)
                : "No deployments found",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching deployments: ${error}`,
            },
          ],
        };
      }
    },
  );

  // Deploy App Tool
  server.tool(
    "deploy_app",
    "Deploy TypeScript or Python apps to Kernel. Provide a dictionary of files where keys are relative file paths and values are file contents. This tool will automatically detect the language, create appropriate project files (package.json/tsconfig.json for TypeScript, pyproject.toml for Python), bundle it into a zip archive, and deploy it to Kernel.",
    {
      files: z
        .record(z.string(), z.string())
        .describe(
          "Dictionary of files where keys are relative file paths (e.g. 'src/index.ts', 'src/utils.ts') and values are the file contents. Relative imports will work correctly as files maintain their paths.",
        ),
      entrypoint: z
        .string()
        .describe(
          "Optional: Explicit entrypoint file path (e.g. 'src/index.ts'). If not provided, will auto-detect from common patterns.",
        )
        .optional(),
      dependencies: z
        .record(z.string(), z.string())
        .describe(
          "Map of package names to exact version strings for production dependencies only. These override auto-discovered runtime dependencies. Do not include dev dependencies.",
        ),
      version: z
        .string()
        .describe("Optional: Version label to deploy (default 'latest')")
        .optional(),
      force: z
        .boolean()
        .describe(
          "If true, allow overwriting an existing version with the same label (default false)",
        )
        .optional(),
    },
    async (params, extra) => {
      if (!extra.authInfo) {
        throw new Error("Authentication required");
      }

      const {
        files,
        entrypoint,
        version = "latest",
        force = false,
        dependencies: providedDependencies,
      } = params;

      // Validate input
      if (!files || Object.keys(files).length === 0) {
        throw new Error("No files provided");
      }

      const client = createKernelClient(extra.authInfo.token);

      try {
        // Detect entrypoint
        const entrypointRelPath = detectEntrypoint(files, entrypoint);

        // Resolve dependencies from all files
        const { discoveredPackages, dependencies: discoveredDependencies } =
          await resolveDependencies(files, providedDependencies);

        // Merge auto-discovered and explicitly provided dependencies
        const resolvedDependencies = mergeDependencies(
          discoveredDependencies,
          providedDependencies,
          entrypointRelPath,
        );

        // Generate project files based on detected language
        const projectFiles = generateProjectFiles(
          entrypointRelPath,
          resolvedDependencies,
        );

        const zip = new JSZip();
        // Add all generated project files
        Object.entries(projectFiles).forEach(([filePath, content]) => {
          zip.file(filePath, content);
        });

        // Add all user files with their original paths
        Object.entries(files).forEach(([filePath, content]) => {
          zip.file(filePath, content);
        });

        const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

        // Write buffer to a temporary location so we can stream it
        const tmpZipPath = path.join(
          os.tmpdir(),
          `kernel_${crypto.randomUUID()}.zip`,
        );
        await fs.writeFile(tmpZipPath, zipBuffer);

        try {
          const response = await client.deployments.create(
            {
              file: createReadStream(tmpZipPath),
              entrypoint_rel_path: entrypointRelPath,
              version,
              force,
            },
            { maxRetries: 0 },
          );

          // Follow deployment events via stream
          let logMessages: string[] = [];
          let finalDeployment = response;
          let appVersionInfo: {
            app_name: string;
            version: string;
            actions: AppAction[];
          } | null = null;

          try {
            const stream = await client.deployments.follow(response.id);

            for await (const event of stream) {
              switch (event.event) {
                case "log":
                  const logMessage = event.message?.replace(/\n$/, "") || "";
                  logMessages.push(`LOG: ${logMessage}`);
                  break;

                case "deployment_state":
                  finalDeployment = event.deployment || finalDeployment;

                  if (
                    finalDeployment.status === "failed" ||
                    finalDeployment.status === "stopped"
                  ) {
                    return {
                      content: [
                        {
                          type: "text",
                          text: JSON.stringify(
                            {
                              status: "failed",
                              deployment: finalDeployment,
                              logs: logMessages,
                              discovered_packages: discoveredPackages,
                              resolved_dependencies: resolvedDependencies,
                              files_deployed: Object.keys(files),
                              entrypoint: entrypointRelPath,
                              error: `Deployment ${finalDeployment.status}: ${finalDeployment.status_reason || "Unknown error"}`,
                            },
                            null,
                            2,
                          ),
                        },
                      ],
                    };
                  }

                  if (finalDeployment.status === "running") {
                    // Deployment completed successfully
                    return {
                      content: [
                        {
                          type: "text",
                          text: JSON.stringify(
                            {
                              status: "success",
                              deployment: finalDeployment,
                              app_info: appVersionInfo,
                              logs: logMessages,
                              discovered_packages: discoveredPackages,
                              resolved_dependencies: resolvedDependencies,
                              files_deployed: Object.keys(files),
                              entrypoint: entrypointRelPath,
                              message: "✔ Deployment completed successfully",
                            },
                            null,
                            2,
                          ),
                        },
                      ],
                    };
                  }
                  break;

                case "app_version_summary":
                  appVersionInfo = {
                    app_name: event.app_name,
                    version: event.version,
                    actions: event.actions || [],
                  };

                  if (event.actions && event.actions.length > 0) {
                    const firstAction = event.actions[0].name;
                    logMessages.push(
                      `App "${event.app_name}" deployed (version: ${event.version})`,
                    );
                    logMessages.push(
                      `Invoke with: kernel invoke ${event.app_name} ${firstAction} --payload '{...}'`,
                    );
                  }
                  break;

                case "error":
                  return {
                    content: [
                      {
                        type: "text",
                        text: JSON.stringify(
                          {
                            status: "error",
                            deployment: finalDeployment,
                            logs: logMessages,
                            discovered_packages: discoveredPackages,
                            resolved_dependencies: resolvedDependencies,
                            files_deployed: Object.keys(files),
                            entrypoint: entrypointRelPath,
                            error: `${event.error?.code || "Unknown"}: ${event.error?.message || "Unknown error"}`,
                          },
                          null,
                          2,
                        ),
                      },
                    ],
                  };
              }
            }

            // If we exit the loop without a final state, return what we have
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      status: "unknown",
                      deployment: finalDeployment,
                      app_info: appVersionInfo,
                      logs: logMessages,
                      discovered_packages: discoveredPackages,
                      resolved_dependencies: resolvedDependencies,
                      files_deployed: Object.keys(files),
                      entrypoint: entrypointRelPath,
                      message:
                        "Deployment stream ended without clear final state",
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          } catch (streamError) {
            // If streaming fails, return the initial deployment response with error info
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      status: "stream_error",
                      deployment: response,
                      logs: logMessages,
                      discovered_packages: discoveredPackages,
                      resolved_dependencies: resolvedDependencies,
                      files_deployed: Object.keys(files),
                      entrypoint: entrypointRelPath,
                      error: `Stream error: ${streamError instanceof Error ? streamError.message : "Unknown streaming error"}`,
                      message: "Deployment initiated but streaming failed",
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }
        } finally {
          // Clean up temporary zip file
          await fs.unlink(tmpZipPath).catch(() => {});
        }
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error deploying app: ${err}`,
            },
          ],
        };
      }
    },
  );
});

async function handleAuthenticatedRequest(req: NextRequest): Promise<Response> {
  const authHeader = req.headers.get("Authorization");
  let token: string | null = null;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  }

  if (!token) {
    return createAuthErrorResponse(
      "invalid_token",
      "Missing or invalid access token",
    );
  }

  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    if (!payload.sub) {
      return createAuthErrorResponse(
        "invalid_token",
        "Invalid token: No user ID found in token payload",
      );
    }

    // Create authenticated handler with auth info
    const authHandler = withMcpAuth(
      handler,
      async (_req, _providedToken) => {
        // Return auth info with validated user data
        return {
          token: token, // Use the validated token
          scopes: ["openid"],
          clientId: "mcp-server",
          extra: {
            userId: payload.sub,
            clerkToken: token,
          },
        };
      },
      {
        required: true,
        resourceMetadataPath: "/.well-known/oauth-protected-resource/mcp",
      },
    );

    return await authHandler(req);
  } catch (authError) {
    return createAuthErrorResponse(
      "invalid_token",
      `Invalid token: ${authError instanceof Error ? authError.message : "Authentication failed"}`,
    );
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  return await handleAuthenticatedRequest(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return await handleAuthenticatedRequest(req);
}
