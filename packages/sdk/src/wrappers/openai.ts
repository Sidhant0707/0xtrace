import OpenAI from "openai";
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletion,
} from "openai/resources/chat/completions";
import type { Stream }               from "openai/streaming";
import type { ChatCompletionChunk }  from "openai/resources";
import type { Tracer }               from "../core/tracer";
import type { ChatMessage }          from "../core/types";

type CreateParams =
  | ChatCompletionCreateParamsNonStreaming
  | ChatCompletionCreateParamsStreaming;

export function wrapOpenAI(client: OpenAI, tracer: Tracer): OpenAI {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "chat") {
        return new Proxy(target.chat, {
          get(chatTarget, chatProp, chatReceiver) {
            if (chatProp === "completions") {
              return new Proxy(chatTarget.completions, {
                get(compTarget, compProp, compReceiver) {
                  if (compProp === "create") {
                    return _makeCreateInterceptor(compTarget, tracer);
                  }
                  return Reflect.get(compTarget, compProp, compReceiver);
                },
              });
            }
            return Reflect.get(chatTarget, chatProp, chatReceiver);
          },
        });
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

function _makeCreateInterceptor(
  compTarget: OpenAI["chat"]["completions"],
  tracer: Tracer
) {
  async function create(
    params: ChatCompletionCreateParamsNonStreaming
  ): Promise<ChatCompletion>;
  async function create(
    params: ChatCompletionCreateParamsStreaming
  ): Promise<Stream<ChatCompletionChunk>>;
  async function create(params: CreateParams): Promise<unknown> {
    const startMs = Date.now();

    if (params.stream === true) {
      let stream: Stream<ChatCompletionChunk>;

      try {
        stream = await (
          compTarget.create as (
            p: ChatCompletionCreateParamsStreaming
          ) => Promise<Stream<ChatCompletionChunk>>
        )(params as ChatCompletionCreateParamsStreaming);
      } catch (err) {
        tracer.captureAsync({
          prompt:    params.messages as ChatMessage[],
          response:  "",
          model:     params.model,
          tokensIn:  undefined,
          tokensOut: undefined,
          latencyMs: Date.now() - startMs,
          isStream:  true,
          error:     err instanceof Error ? err.message : String(err),
        });
        throw err;
      }

      return _wrapStream(stream, params, startMs, tracer);
    }

    let result: ChatCompletion;

    try {
      result = await (
        compTarget.create as (
          p: ChatCompletionCreateParamsNonStreaming
        ) => Promise<ChatCompletion>
      )(params as ChatCompletionCreateParamsNonStreaming);
    } catch (err) {
      tracer.captureAsync({
        prompt:    params.messages as ChatMessage[],
        response:  "",
        model:     params.model,
        tokensIn:  undefined,
        tokensOut: undefined,
        latencyMs: Date.now() - startMs,
        isStream:  false,
        error:     err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    const latencyMs = Date.now() - startMs;

    tracer.captureAsync({
      prompt:    params.messages as ChatMessage[],
      response:  result.choices[0]?.message?.content ?? "",
      model:     params.model,
      tokensIn:  result.usage?.prompt_tokens,
      tokensOut: result.usage?.completion_tokens,
      latencyMs,
      isStream:  false,
    });

    return result;
  }

  return create;
}

async function* _wrapStream(
  stream: Stream<ChatCompletionChunk>,
  params: CreateParams,
  startMs: number,
  tracer: Tracer
): AsyncGenerator<ChatCompletionChunk> {
  let fullContent   = "";
  let chunkCount    = 0;
  let promptTokens: number | undefined;
  let caughtError:  Error | undefined;

  try {
    for await (const chunk of stream) {
      if (chunk.usage?.prompt_tokens !== undefined) {
        promptTokens = chunk.usage.prompt_tokens;
      }

      const delta  = chunk.choices[0]?.delta?.content ?? "";
      fullContent += delta;
      chunkCount  += 1;

      yield chunk;
    }
  } catch (err) {
    caughtError = err instanceof Error ? err : new Error(String(err));
    throw caughtError;
  } finally {
    const latencyMs = Date.now() - startMs;

    tracer.captureAsync({
      prompt:    params.messages as ChatMessage[],
      response:  fullContent,
      model:     params.model,
      tokensIn:  promptTokens,
      tokensOut: chunkCount,
      latencyMs,
      isStream:  true,
      ...(caughtError ? { error: caughtError.message } : {}),
    });
  }
}