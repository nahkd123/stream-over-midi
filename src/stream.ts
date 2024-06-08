export namespace StreamOverMIDI {
    export interface BaseOptions {
        manufacturerId?: number;
        mode?: "binary" | "ascii";
    }

    export interface WritableOptions extends BaseOptions {}
    export interface ReadableOptions extends BaseOptions {}

    export function wrapAsWritable(callback: (chunk: Iterable<number>) => any, options?: WritableOptions): WritableStream;
    export function wrapAsWritable(port: MIDIOutput, options?: WritableOptions): WritableStream;
    export function wrapAsWritable(arg: ((chunk: Iterable<number>) => any) | MIDIOutput, options?: WritableOptions) {
        if (arg instanceof MIDIOutput) return wrapAsWritable(chunk => arg.send(chunk));

        const mode = options?.mode ?? "binary";
        let encoder = new TextEncoder();

        return new WritableStream({
            async write(chunk, controller) {
                let data: ArrayLike<number>;
                if (chunk instanceof ArrayBuffer) data = new Uint8Array(chunk);
                else if (chunk instanceof Uint8Array || chunk instanceof Array) data = chunk;
                else if (chunk instanceof Blob) data = new Uint8Array(await chunk.arrayBuffer());
                else if (typeof chunk == "string") data = encoder.encode(chunk);
                else controller.error(new Error("Unsupported chunk type: " + chunk));

                const buffer = new Uint8Array(3 + (mode == "binary" ? Math.ceil(data.length * 8 / 7) : data.length));
                buffer[0] = 0xF0;
                buffer[1] = options?.manufacturerId ?? 0x7D; // 0x7D - Reserved for educational and development
                
                let int = 0, offset = 0, storedBits = 0;

                for (let i = 0; i < data.length; i++) {
                    if (mode == "ascii") {
                        buffer[2 + i] = data[i] & 0x7F;
                        continue;
                    }

                    int <<= 8;
                    int |= data[i];
                    storedBits += 8;

                    while (storedBits >= 7) {
                        const mask = 0x7F << (storedBits - 7);
                        buffer[2 + offset] = (int & mask) >> (storedBits - 7);
                        storedBits -= 7;
                        int &= ~mask;
                        offset++;
                    }
                }

                if (storedBits > 0) buffer[2 + offset] = int << (7 - storedBits);
                buffer[buffer.length - 1] = 0xF7;
                arg(buffer);
            }
        });
    }

    export function wrapAsReadable(port: MIDIInput, options?: ReadableOptions): ReadableStream<Uint8Array> {
        const mode = options?.mode ?? "binary";

        return new ReadableStream({
            start(controller) {
                let onMidiMessage: (e: MIDIMessageEvent) => any;
                let onStateChange: () => any;

                port.addEventListener("midimessage", onMidiMessage = e => {
                    const { data } = e;
                    if (!(data[0] == 0xF0 && data[1] == (options?.manufacturerId ?? 0x7D))) return;

                    const asciiSize = data.length - 3;
                    const binarySize = Math.ceil(asciiSize * 7 / 8);
                    const buffer = new Uint8Array(mode == "ascii" ? asciiSize : binarySize);

                    let int = 0, offset = 0, storedBits = 0;

                    for (let i = 0; i < data.length - 3; i++) {
                        if (data[2 + i] == 0xF7) break;

                        if (mode == "ascii") {
                            buffer[i] = data[2 + i] & 0x7F;
                            continue;
                        }
    
                        int <<= 7;
                        int |= data[2 + i];
                        storedBits += 7;
    
                        while (storedBits >= 8) {
                            const mask = 0xFF << (storedBits - 8);
                            buffer[offset] = (int & mask) >> (storedBits - 8);
                            storedBits -= 8;
                            int &= ~mask;
                            offset++;
                        }
                    }
    
                    controller.enqueue(buffer.slice(0, offset));
                });

                port.addEventListener("statechange", onStateChange = () => {
                    if (port.state == "disconnected") {
                        controller.close();
                        port.removeEventListener("midimessage", onMidiMessage);
                        port.removeEventListener("statechange", onStateChange);
                    }
                });
            }
        });
    }
}