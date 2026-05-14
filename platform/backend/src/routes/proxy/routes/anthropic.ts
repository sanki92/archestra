import fastifyHttpProxy from "@fastify/http-proxy";
import { ApiError, hasArchestraTokenPrefix, RouteId } from "@shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import config from "@/config";
import logger from "@/logging";
import { Anthropic, constructResponseSchema, UuidIdSchema } from "@/types";
import { anthropicAdapterFactory } from "../adapters";
import { PROXY_API_PREFIX, PROXY_BODY_LIMIT } from "../common";
import {
  validateVirtualApiKey,
  virtualKeyRateLimiter,
} from "../llm-proxy-auth";
import { handleLLMProxy } from "../llm-proxy-handler";
import { createProxyPreHandler } from "./proxy-prehandler";

const anthropicProxyRoutes: FastifyPluginAsyncZod = async (fastify) => {
  const ANTHROPIC_PREFIX = `${PROXY_API_PREFIX}/anthropic`;
  const MESSAGES_SUFFIX = "/messages";
  const MODELS_SUFFIX = "/v1/models";

  logger.info("[UnifiedProxy] Registering unified Anthropic routes");

  await fastify.register(fastifyHttpProxy, {
    upstream: config.llm.anthropic.baseUrl,
    prefix: ANTHROPIC_PREFIX,
    rewritePrefix: "",
    preHandler: createProxyPreHandler({
      apiPrefix: ANTHROPIC_PREFIX,
      endpointSuffix: MESSAGES_SUFFIX,
      upstream: config.llm.anthropic.baseUrl,
      providerName: "Anthropic",
      rewritePrefix: "",
      skipErrorResponse: {
        type: "error",
        error: {
          type: "invalid_request_error",
          message:
            "Messages requests should use the dedicated endpoint: POST /v1/anthropic/v1/messages",
        },
      },
    }),
  });

  /**
   * Anthropic SDK standard format (with /v1 prefix)
   * No agentId is provided -- agent is created/fetched based on the user-agent header
   */
  fastify.post(
    `${ANTHROPIC_PREFIX}/v1${MESSAGES_SUFFIX}`,
    {
      bodyLimit: PROXY_BODY_LIMIT,
      schema: {
        operationId: RouteId.AnthropicMessagesWithDefaultAgent,
        description: "Send a message to Anthropic using the default agent",
        tags: ["LLM Proxy"],
        body: Anthropic.API.MessagesRequestSchema,
        headers: Anthropic.API.MessagesHeadersSchema,
        response: constructResponseSchema(Anthropic.API.MessagesResponseSchema),
      },
    },
    async (request, reply) => {
      logger.info(
        {
          url: request.url,
          headers: request.headers,
          bodyKeys: Object.keys(request.body || {}),
        },
        "[UnifiedProxy] Handling Anthropic request (default agent) - FULL REQUEST DEBUG",
      );
      return handleLLMProxy(
        request.body,
        request,
        reply,
        anthropicAdapterFactory,
      );
    },
  );

  /**
   * Anthropic SDK standard format (with /v1 prefix)
   * An agentId is provided -- agent is fetched based on the agentId
   *
   * NOTE: this is really only needed for n8n compatibility...
   */
  fastify.post(
    `${ANTHROPIC_PREFIX}/:agentId/v1${MESSAGES_SUFFIX}`,
    {
      bodyLimit: PROXY_BODY_LIMIT,
      schema: {
        operationId: RouteId.AnthropicMessagesWithAgent,
        description:
          "Send a message to Anthropic using a specific agent (n8n URL format)",
        tags: ["LLM Proxy"],
        params: z.object({
          agentId: UuidIdSchema,
        }),
        body: Anthropic.API.MessagesRequestSchema,
        headers: Anthropic.API.MessagesHeadersSchema,
        response: constructResponseSchema(Anthropic.API.MessagesResponseSchema),
      },
    },
    async (request, reply) => {
      logger.info(
        {
          url: request.url,
          agentId: request.params.agentId,
          headers: request.headers,
          bodyKeys: Object.keys(request.body || {}),
        },
        "[UnifiedProxy] Handling Anthropic request (with agent) - FULL REQUEST DEBUG",
      );
      return handleLLMProxy(
        request.body,
        request,
        reply,
        anthropicAdapterFactory,
      );
    },
  );

  fastify.get(`${ANTHROPIC_PREFIX}${MODELS_SUFFIX}`, async (request, reply) =>
    handleAnthropicModelsList(request, reply),
  );

  fastify.get(
    `${ANTHROPIC_PREFIX}/:agentId${MODELS_SUFFIX}`,
    {
      schema: {
        params: z.object({ agentId: UuidIdSchema }),
      },
    },
    async (request, reply) => handleAnthropicModelsList(request, reply),
  );
};

export default anthropicProxyRoutes;

async function handleAnthropicModelsList(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const { apiKey, authToken, baseUrl } =
    await resolveAnthropicProxyCredentials(request);

  const queryIdx = request.url.indexOf("?");
  const queryString = queryIdx >= 0 ? request.url.slice(queryIdx) : "";
  const upstreamUrl = `${baseUrl ?? config.llm.anthropic.baseUrl}/v1/models${queryString}`;

  const versionHeader = request.headers["anthropic-version"];
  const upstreamHeaders: Record<string, string> = {
    "anthropic-version":
      (typeof versionHeader === "string" ? versionHeader : undefined) ??
      "2023-06-01",
  };
  if (apiKey) upstreamHeaders["x-api-key"] = apiKey;
  if (authToken) upstreamHeaders.authorization = `Bearer ${authToken}`;

  const upstreamResponse = await fetch(upstreamUrl, {
    method: "GET",
    headers: upstreamHeaders,
  });

  const responseBody = await upstreamResponse.text();
  const contentType =
    upstreamResponse.headers.get("content-type") ?? "application/json";
  return reply
    .status(upstreamResponse.status)
    .type(contentType)
    .send(responseBody);
}

async function resolveAnthropicProxyCredentials(
  request: FastifyRequest,
): Promise<{ apiKey?: string; authToken?: string; baseUrl?: string }> {
  const xApiKey = request.headers["x-api-key"];
  const xApiKeyValue =
    typeof xApiKey === "string" && xApiKey.length > 0 ? xApiKey : undefined;
  const authHeader = request.headers.authorization;
  const bearerToken =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : undefined;

  const rawKey = xApiKeyValue ?? bearerToken;
  if (!rawKey) {
    throw new ApiError(401, "Missing authentication credentials");
  }

  if (hasArchestraTokenPrefix(rawKey)) {
    await virtualKeyRateLimiter.check(request.ip);
    try {
      const resolved = await validateVirtualApiKey(rawKey, "anthropic");
      return { apiKey: resolved.apiKey, baseUrl: resolved.baseUrl };
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 401) {
        await virtualKeyRateLimiter.recordFailure(request.ip);
      }
      throw error;
    }
  }

  if (xApiKeyValue) {
    return { apiKey: xApiKeyValue };
  }
  return { authToken: bearerToken };
}
