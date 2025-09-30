import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ImageService } from './image-service.js';
import { GenerateImageParamsSchema, MultiImageResult } from './types.js';
import { generateImageToolSchema, generateParameterValidationMessage } from './utils/tool-schema-generator.js';
import { getModelByName } from './models/index.js';

// Server configuration from environment variables
const serverConfig = {
  cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN || '',
  cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
  defaultModel: process.env.DEFAULT_IMAGE_GENERATION_MODEL || '@cf/leonardo/lucid-origin',
};

const imageService = new ImageService(serverConfig);

// Create server instance
const server = new Server(
  {
    name: 'cloudflare-image-mcp',
    version: '0.0.3',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  // Generate dynamic schema based on configured model
  const generateImageSchema = generateImageToolSchema(serverConfig.defaultModel);

  return {
    tools: [
      generateImageSchema,
      {
        name: 'list_models',
        description: 'List available Cloudflare Workers AI image generation models with their capabilities',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'generate_image') {
      // Validate and parse arguments
      const params = GenerateImageParamsSchema.parse(args);

      // Validate required configuration
      if (!serverConfig.cloudflareApiToken || !serverConfig.cloudflareAccountId) {
        throw new Error(
          'Cloudflare API Token and Account ID must be configured in environment variables'
        );
      }

      if (!params.prompt.trim()) {
        throw new Error('Please provide a prompt for image generation');
      }

      // Generate image
      const result = await imageService.generateImage(params) as MultiImageResult;

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${result.results[0]?.error || 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }

      // Build response text based on number of images
      let responseText: string;
      const imageUrls = Array.isArray(result.imageUrl) ? result.imageUrl : [result.imageUrl].filter(Boolean);

      if (imageUrls.length === 1) {
        // Single image response
        responseText = `Image generated successfully for prompt: '${params.prompt}'\n\n`;
        responseText += `![Generated Image](${imageUrls[0]})`;
      } else {
        // Multiple images response
        responseText = `Generated ${result.successfulCount} image${result.successfulCount !== 1 ? 's' : ''} for prompt: '${params.prompt}'`;

        if (result.failedCount > 0) {
          responseText += ` (${result.failedCount} failed)`;
        }
        responseText += '\n\n';

        // Add each successful image
        imageUrls.forEach((url, index) => {
          responseText += `![Generated Image ${index + 1}](${url})\n\n`;
        });

        // Add error details for failed images
        const failedResults = result.results.filter(r => !r.success && r.error);
        if (failedResults.length > 0) {
          responseText += 'Failed images:\n';
          failedResults.forEach((failed, index) => {
            responseText += `- Image ${failed.sequence || index + 1}: ${failed.error}\n`;
          });
        }
      }

      // Add validation warnings for ignored parameters
      if (result.ignoredParams && result.ignoredParams.length > 0) {
        const model = getModelByName(serverConfig.defaultModel);
        const validationMessage = generateParameterValidationMessage(params, serverConfig.defaultModel, model.config);
        if (validationMessage) {
          responseText += `\n\n${validationMessage}`;
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: responseText,
          },
        ],
      };
    }

    if (name === 'list_models') {
      const modelsInfo = await imageService.listModels();
      return {
        content: [
          {
            type: 'text',
            text: modelsInfo,
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Cloudflare Image MCP Server started');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});