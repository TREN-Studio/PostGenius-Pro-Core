import {
    Transport,
    TransportRequest,
    TransportResponse
} from '@hashbrownai/core';
import { encodeFrame } from '@hashbrownai/core';
import { generateTextWithGemini } from './geminiService'; // We will assume/ensure this exists or use raw fetch
import { AiConfig } from '../types';

export class GeminiTransport implements Transport {
    readonly name = 'gemini-transport';

    constructor(private apiKey: string, private model: string = 'gemini-1.5-flash') { }

    async send(request: TransportRequest): Promise<TransportResponse> {
        const { params } = request;
        const messages = params.messages || [];

        // Extract the last user message as prompt (simplification for extraction)
        const lastMsg = messages[messages.length - 1];
        const prompt = typeof lastMsg.content === 'string' ? lastMsg.content : JSON.stringify(lastMsg.content);

        // We can't easily stream from our existing service yet, so we'll do full generation and then simulate a stream.
        // In a real agent, we'd use a streaming API.

        const stream = new ReadableStream<Uint8Array>({
            async start(controller) {
                try {
                    // 1. Send Start Frame
                    controller.enqueue(encodeFrame({ type: 'generation-start' }));

                    // 2. Call Gemini
                    // We assume params.system might be passed, but for now we trust the Service to handle system prompt via messages or just simplistic
                    const text = await generateTextWithGemini(prompt, this.apiKey);

                    // 3. Send Chunk Frame
                    controller.enqueue(encodeFrame({
                        type: 'generation-chunk',
                        chunk: {
                            id: 'gemini-1',
                            object: 'chat.completion.chunk',
                            created: Date.now(),
                            model: this.model,
                            choices: [{
                                index: 0,
                                delta: { content: text },
                                finish_reason: null
                            }]
                        }
                    }));

                    // 4. Send Finish Frame
                    controller.enqueue(encodeFrame({ type: 'generation-finish' }));

                } catch (error: any) {
                    controller.enqueue(encodeFrame({
                        type: 'generation-error',
                        error: error.message || 'Unknown error'
                    }));
                } finally {
                    controller.close();
                }
            }
        });

        return { stream };
    }
}
