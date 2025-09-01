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

// Mintlify Search API types
interface MintlifyChunkMetadata {
  title?: string;
  breadcrumbs?: string[];
  hash?: string;
  [key: string]: unknown;
}

interface MintlifyChunk {
  id: string;
  link: string;
  created_at: string;
  updated_at: string;
  chunk_html?: string;
  metadata?: MintlifyChunkMetadata;
  tracking_id: string;
  time_stamp?: string;
  dataset_id: string;
  weight: number;
  location?: Record<string, unknown>;
  image_urls?: string[];
  tag_set: string[];
  num_value?: number;
}

interface MintlifyChunkWrapper {
  chunk: MintlifyChunk;
  highlights?: string[];
  score: number;
}

interface MintlifyGroup {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  dataset_id: string;
  tracking_id: string;
  metadata: Record<string, unknown>;
  tag_set: string[];
}

interface MintlifySearchResult {
  group: MintlifyGroup;
  chunks: MintlifyChunkWrapper[];
  file_id?: string;
}

interface MintlifySearchResponse {
  id: string;
  results: MintlifySearchResult[];
  corrected_query?: string;
  total_pages: number;
}

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
    "Fast vector search through Kernel platform documentation to find relevant information, guides, tutorials, and API references. Returns ranked documentation chunks with titles, URLs, and content snippets. Use this tool when you need to understand how Kernel features work, troubleshoot issues, or provide accurate information about the platform capabilities.",
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

      if (!process.env.MINTLIFY_DATASET_ID) {
        console.error("MINTLIFY_DATASET_ID environment variable is not set");
        return {
          content: [
            {
              type: "text",
              text: "Error: MINTLIFY_DATASET_ID environment variable is not set",
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

      const headers = {
        accept: "*/*",
        "accept-language": "en-US,en;q=0.6",
        authorization: process.env.MINTLIFY_API_TOKEN,
        "tr-dataset": process.env.MINTLIFY_DATASET_ID,
        "x-api-version": "V2",
        "Content-Type": "application/json",
      };

      const searchBody = {
        query: query,
        search_type: "fulltext",
        extend_results: true,
        highlight_options: {
          highlight_window: 10,
          highlight_max_num: 3,
          highlight_max_length: 5,
          highlight_strategy: "exactmatch",
          highlight_delimiters: ["?", ",", ".", "!", "\n", " "],
          highlight_results: true,
        },
        score_threshold: 0.1, // Lower threshold for broader results
        filters: {
          must_not: [
            {
              field: "tag_set",
              match: ["code"], // Exclude code blocks as suggested
            },
          ],
        },
        page_size: 10,
        group_size: 5, // More chunks per group for comprehensive results
        get_total_pages: true,
        remove_stop_words: true,
        slim_chunks: false, // Get full chunk data
        use_quote_negated_terms: true,
        scoring_options: {
          semantic_boost: {
            phrase: query,
            distance_factor: 1.2,
          },
        },
        sort_options: {
          use_weights: true,
        },
        typo_options: {
          correct_typos: true,
          prioritize_domain_specifc_words: true,
          one_typo_word_range: {
            min: 4,
            max: 8,
          },
          two_typo_word_range: {
            min: 8,
            max: 12,
          },
        },
      };

      try {
        const searchResponse = await fetch(
          "https://api.mintlifytrieve.com/api/chunk_group/group_oriented_search",
          {
            method: "POST",
            headers,
            body: JSON.stringify(searchBody),
          },
        );

        if (!searchResponse.ok) {
          console.error(
            `Failed to search documentation: ${searchResponse.status} ${searchResponse.statusText}`,
          );
          throw new Error(
            `Failed to search documentation: ${searchResponse.status} ${searchResponse.statusText}`,
          );
        }

        const searchResults: MintlifySearchResponse =
          await searchResponse.json();

        // Format the search results for better readability
        let formattedResults = "# Documentation Search Results\n\n";

        if (searchResults.results && searchResults.results.length > 0) {
          searchResults.results.forEach(
            (result: MintlifySearchResult, resultIndex: number) => {
              if (result.chunks && result.chunks.length > 0) {
                const groupName =
                  result.group?.name || `Result Group ${resultIndex + 1}`;
                formattedResults += `## ${groupName}\n\n`;

                result.chunks.forEach(
                  (chunkWrapper: MintlifyChunkWrapper, chunkIndex: number) => {
                    const chunk = chunkWrapper.chunk;
                    const title = chunk.metadata?.title || "Untitled";
                    formattedResults += `### ${chunkIndex + 1}. ${title}\n\n`;

                    // Add breadcrumb navigation if available
                    if (
                      chunk.metadata?.breadcrumbs &&
                      chunk.metadata.breadcrumbs.length > 0
                    ) {
                      formattedResults += `**Navigation:** ${chunk.metadata.breadcrumbs.join(" > ")}\n\n`;
                    }

                    // Add score for relevance indication
                    formattedResults += `**Relevance Score:** ${chunkWrapper.score.toFixed(3)}\n\n`;

                    if (chunk.chunk_html) {
                      // Remove HTML tags for cleaner text
                      const cleanText = chunk.chunk_html.replace(
                        /<[^>]*>/g,
                        "",
                      );
                      formattedResults += `${cleanText}\n\n`;
                    }

                    if (
                      chunkWrapper.highlights &&
                      chunkWrapper.highlights.length > 0
                    ) {
                      formattedResults += `**Highlights:** ${chunkWrapper.highlights.join(", ")}\n\n`;
                    }

                    formattedResults += "---\n\n";
                  },
                );
              }
            },
          );
        } else {
          formattedResults += "No results found for your query.";
        }

        return {
          content: [
            {
              type: "text",
              text: formattedResults,
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
      timeout_seconds: z
        .number()
        .describe(
          "The number of seconds of inactivity before the browser session is terminated. Only applicable to non-persistent browsers. Activity includes CDP connections and live view connections. Defaults to 60 seconds.",
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
      { headless, invocation_id, persistence_id, stealth, timeout_seconds },
      extra,
    ) => {
      if (!extra.authInfo) {
        throw new Error("Authentication required");
      }

      const client = createKernelClient(extra.authInfo.token);

      try {
        const kernelBrowser = await client.browsers.create({
          ...(headless && { headless: headless }),
          ...(invocation_id && { invocation_id: invocation_id }),
          ...(persistence_id && { persistence: { id: persistence_id } }),
          ...(stealth && { stealth: stealth }),
          ...(timeout_seconds && { timeout_seconds: timeout_seconds }),
        });

        return {
          content: [
            {
              type: "text",
              text: kernelBrowser
                ? JSON.stringify(kernelBrowser, null, 2)
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

  // Browser Agent Tool (one-off NL web task)
  server.tool(
    "browser_agent",
    "Run a one-off browser automation task in Kernel using a chat-style instruction. Optionally provide a starting URL.",
    {
      task: z
        .string()
        .describe("Natural language instruction for the browser task (required)"),
      url: z
        .string()
        .url()
        .describe("Optional starting URL to open before executing the task")
        .optional(),
    },
    async (
      { task, url },
      extra,
    ) => {
      if (!extra.authInfo) {
        throw new Error("Authentication required");
      }

      const client = createKernelClient(extra.authInfo.token);

      try {
        // Invoke the deployed app action
        const payloadObj: Record<string, unknown> = { task };
        if (url) payloadObj.url = url;

        const invocation = await client.invocations.create({
          app_name: "mcp-browser-agent",
          action_name: "task-agent",
          payload: JSON.stringify(payloadObj),
          version: "latest",
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
              if (
                finalResult.status === "succeeded" ||
                finalResult.status === "failed"
              ) {
                break;
              }
              break;
            default:
              break;
          }

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
              text: `Error running browser agent: ${error}`,
            },
          ],
        };
      }
    },
  );

  // // Deploy App Tool
  // server.tool(
  //   "deploy_app",
  //   "Deploy TypeScript or Python apps to Kernel. Provide a dictionary of files where keys are relative file paths and values are file contents. This tool will automatically detect the language, create appropriate project files (package.json/tsconfig.json for TypeScript, pyproject.toml for Python), bundle it into a zip archive, and deploy it to Kernel.",
  //   {
  //     files: z
  //       .record(z.string(), z.string())
  //       .describe(
  //         "Dictionary of files where keys are relative file paths (e.g. 'src/index.ts', 'src/utils.ts') and values are the file contents. Relative imports will work correctly as files maintain their paths.",
  //       ),
  //     entrypoint: z
  //       .string()
  //       .describe(
  //         "Optional: Explicit entrypoint file path (e.g. 'src/index.ts'). If not provided, will auto-detect from common patterns.",
  //       )
  //       .optional(),
  //     dependencies: z
  //       .record(z.string(), z.string())
  //       .describe(
  //         "Map of package names to exact version strings for production dependencies only. These override auto-discovered runtime dependencies. Do not include dev dependencies.",
  //       ),
  //     version: z
  //       .string()
  //       .describe("Optional: Version label to deploy (default 'latest')")
  //       .optional(),
  //     force: z
  //       .boolean()
  //       .describe(
  //         "If true, allow overwriting an existing version with the same label (default false)",
  //       )
  //       .optional(),
  //   },
  //   async (params, extra) => {
  //     if (!extra.authInfo) {
  //       throw new Error("Authentication required");
  //     }

  //     const {
  //       files,
  //       entrypoint,
  //       version = "latest",
  //       force = false,
  //       dependencies: providedDependencies,
  //     } = params;

  //     // Validate input
  //     if (!files || Object.keys(files).length === 0) {
  //       throw new Error("No files provided");
  //     }

  //     const client = createKernelClient(extra.authInfo.token);

  //     try {
  //       // Detect entrypoint
  //       const entrypointRelPath = detectEntrypoint(files, entrypoint);

  //       // Resolve dependencies from all files
  //       const { discoveredPackages, dependencies: discoveredDependencies } =
  //         await resolveDependencies(files, providedDependencies);

  //       // Merge auto-discovered and explicitly provided dependencies
  //       const resolvedDependencies = mergeDependencies(
  //         discoveredDependencies,
  //         providedDependencies,
  //         entrypointRelPath,
  //       );

  //       // Generate project files based on detected language
  //       const projectFiles = generateProjectFiles(
  //         entrypointRelPath,
  //         resolvedDependencies,
  //       );

  //       const zip = new JSZip();
  //       // Add all generated project files
  //       Object.entries(projectFiles).forEach(([filePath, content]) => {
  //         zip.file(filePath, content);
  //       });

  //       // Add all user files with their original paths
  //       Object.entries(files).forEach(([filePath, content]) => {
  //         zip.file(filePath, content);
  //       });

  //       const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

  //       // Write buffer to a temporary location so we can stream it
  //       const tmpZipPath = path.join(
  //         os.tmpdir(),
  //         `kernel_${crypto.randomUUID()}.zip`,
  //       );
  //       await fs.writeFile(tmpZipPath, zipBuffer);

  //       try {
  //         const response = await client.deployments.create(
  //           {
  //             file: createReadStream(tmpZipPath),
  //             entrypoint_rel_path: entrypointRelPath,
  //             version,
  //             force,
  //           },
  //           { maxRetries: 0 },
  //         );

  //         // Follow deployment events via stream
  //         let logMessages: string[] = [];
  //         let finalDeployment = response;
  //         let appVersionInfo: {
  //           app_name: string;
  //           version: string;
  //           actions: AppAction[];
  //         } | null = null;

  //         try {
  //           const stream = await client.deployments.follow(response.id);

  //           for await (const event of stream) {
  //             switch (event.event) {
  //               case "log":
  //                 const logMessage = event.message?.replace(/\n$/, "") || "";
  //                 logMessages.push(`LOG: ${logMessage}`);
  //                 break;

  //               case "deployment_state":
  //                 finalDeployment = event.deployment || finalDeployment;

  //                 if (
  //                   finalDeployment.status === "failed" ||
  //                   finalDeployment.status === "stopped"
  //                 ) {
  //                   return {
  //                     content: [
  //                       {
  //                         type: "text",
  //                         text: JSON.stringify(
  //                           {
  //                             status: "failed",
  //                             deployment: finalDeployment,
  //                             logs: logMessages,
  //                             discovered_packages: discoveredPackages,
  //                             resolved_dependencies: resolvedDependencies,
  //                             files_deployed: Object.keys(files),
  //                             entrypoint: entrypointRelPath,
  //                             error: `Deployment ${finalDeployment.status}: ${finalDeployment.status_reason || "Unknown error"}`,
  //                           },
  //                           null,
  //                           2,
  //                         ),
  //                       },
  //                     ],
  //                   };
  //                 }

  //                 if (finalDeployment.status === "running") {
  //                   // Deployment completed successfully
  //                   return {
  //                     content: [
  //                       {
  //                         type: "text",
  //                         text: JSON.stringify(
  //                           {
  //                             status: "success",
  //                             deployment: finalDeployment,
  //                             app_info: appVersionInfo,
  //                             logs: logMessages,
  //                             discovered_packages: discoveredPackages,
  //                             resolved_dependencies: resolvedDependencies,
  //                             files_deployed: Object.keys(files),
  //                             entrypoint: entrypointRelPath,
  //                             message: "✔ Deployment completed successfully",
  //                           },
  //                           null,
  //                           2,
  //                         ),
  //                       },
  //                     ],
  //                   };
  //                 }
  //                 break;

  //               case "app_version_summary":
  //                 appVersionInfo = {
  //                   app_name: event.app_name,
  //                   version: event.version,
  //                   actions: event.actions || [],
  //                 };

  //                 if (event.actions && event.actions.length > 0) {
  //                   const firstAction = event.actions[0].name;
  //                   logMessages.push(
  //                     `App "${event.app_name}" deployed (version: ${event.version})`,
  //                   );
  //                   logMessages.push(
  //                     `Invoke with: kernel invoke ${event.app_name} ${firstAction} --payload '{...}'`,
  //                   );
  //                 }
  //                 break;

  //               case "error":
  //                 return {
  //                   content: [
  //                     {
  //                       type: "text",
  //                       text: JSON.stringify(
  //                         {
  //                           status: "error",
  //                           deployment: finalDeployment,
  //                           logs: logMessages,
  //                           discovered_packages: discoveredPackages,
  //                           resolved_dependencies: resolvedDependencies,
  //                           files_deployed: Object.keys(files),
  //                           entrypoint: entrypointRelPath,
  //                           error: `${event.error?.code || "Unknown"}: ${event.error?.message || "Unknown error"}`,
  //                         },
  //                         null,
  //                         2,
  //                       ),
  //                     },
  //                   ],
  //                 };
  //             }
  //           }

  //           // If we exit the loop without a final state, return what we have
  //           return {
  //             content: [
  //               {
  //                 type: "text",
  //                 text: JSON.stringify(
  //                   {
  //                     status: "unknown",
  //                     deployment: finalDeployment,
  //                     app_info: appVersionInfo,
  //                     logs: logMessages,
  //                     discovered_packages: discoveredPackages,
  //                     resolved_dependencies: resolvedDependencies,
  //                     files_deployed: Object.keys(files),
  //                     entrypoint: entrypointRelPath,
  //                     message:
  //                       "Deployment stream ended without clear final state",
  //                   },
  //                   null,
  //                   2,
  //                 ),
  //               },
  //             ],
  //           };
  //         } catch (streamError) {
  //           // If streaming fails, return the initial deployment response with error info
  //           return {
  //             content: [
  //               {
  //                 type: "text",
  //                 text: JSON.stringify(
  //                   {
  //                     status: "stream_error",
  //                     deployment: response,
  //                     logs: logMessages,
  //                     discovered_packages: discoveredPackages,
  //                     resolved_dependencies: resolvedDependencies,
  //                     files_deployed: Object.keys(files),
  //                     entrypoint: entrypointRelPath,
  //                     error: `Stream error: ${streamError instanceof Error ? streamError.message : "Unknown streaming error"}`,
  //                     message: "Deployment initiated but streaming failed",
  //                   },
  //                   null,
  //                   2,
  //                 ),
  //               },
  //             ],
  //           };
  //         }
  //       } finally {
  //         // Clean up temporary zip file
  //         await fs.unlink(tmpZipPath).catch(() => {});
  //       }
  //     } catch (err) {
  //       return {
  //         content: [
  //           {
  //             type: "text",
  //             text: `Error deploying app: ${err}`,
  //           },
  //         ],
  //       };
  //     }
  //   },
  // );
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
