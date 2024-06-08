import { StreamOverMIDI } from "./stream";

let midiAccess: MIDIAccess = undefined;
let selectedInput: MIDIInput = undefined;
let selectedInputStream: ReadableStream<Uint8Array> = undefined;
let selectedOutput: MIDIOutput = undefined;
let selectedOutputStream: WritableStream = undefined;

document.getElementById("request-permission").addEventListener("click", async () => {
    midiAccess = await navigator.requestMIDIAccess({ sysex: true });
    messageLog("Obtained permission!");
    refreshList();
});
document.getElementById("refresh").addEventListener("click", refreshList);
document.getElementById("send").addEventListener("click", () => sendMessage((document.getElementById("message") as HTMLTextAreaElement).value));

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function refreshList() {
    populateDevicesList(document.getElementById("input-devices") as HTMLDivElement, midiAccess.inputs, async port => {
        selectedInput = port;
        selectedInputStream = StreamOverMIDI.wrapAsReadable(selectedInput);
        messageLog(`[SYSTEM] Selected input: ${port.id}`);

        const reader = selectedInputStream.getReader();
        while (true) {
            const result = await reader.read();
            if (result.done) break;
            messageLog(`${port.id} -> ${decoder.decode(result.value!)}`);
        }
    });
    
    populateDevicesList(document.getElementById("output-devices") as HTMLDivElement, midiAccess.outputs, async port => {
        selectedOutput = port;
        if (selectedOutputStream) await selectedOutputStream.close();
        selectedOutputStream = StreamOverMIDI.wrapAsWritable(selectedOutput);
        messageLog(`[SYSTEM] Selected output: ${port.id}`);
    });
}

const logList = document.getElementById("message-log") as HTMLDivElement;
function messageLog(message: string) {
    const pre = document.createElement("pre");
    pre.textContent = message;
    logList.append(pre);
}

function populateDevicesList<T extends MIDIPort>(element: HTMLDivElement, devices: ReadonlyMap<string, T>, callback: (port: T) => any) {
    element.childNodes.forEach(node => node.remove());

    for (let [id, port] of devices) {
        const div = document.createElement("div");

        const label = document.createElement("span");
        label.textContent = `ID: ${id} - ${port.name} (${port.manufacturer}) `;

        const button = document.createElement("button");
        button.textContent = "Use this device";
        button.disabled = (port as MIDIPort) == selectedInput || (port as MIDIPort) == selectedOutput;
        button.addEventListener("click", () => {
            callback(port);
            populateDevicesList(element, devices, callback);
        });

        div.append(label, button);
        element.append(div);
    }
}

async function sendMessage(message: string) {
    const writer = selectedOutputStream.getWriter();
    await writer.write(encoder.encode(message));
    writer.releaseLock();
    messageLog(`${selectedOutput!.id} <- ${message}`);
}