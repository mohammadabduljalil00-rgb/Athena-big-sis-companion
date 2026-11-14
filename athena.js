
let port;
let reader;
let writer;
let connected = false;
let buffer = "";

const status = document.getElementById("status");
const connectButton = document.getElementById("connect");
const disconnectButton = document.getElementById("disconnect");
const messages = document.getElementById("messages");

function showMessage(text, sender = "athena") {
  const p = document.createElement("p");
  p.className = sender;
  p.textContent = (sender === "user" ? "You: " : "Athena: ") + text;
  messages.appendChild(p);
  messages.scrollTop = messages.scrollHeight;
}

async function send(data) {
  if (!writer) return;
  await writer.write(
    new TextEncoder().encode(JSON.stringify(data) + "\n")
  );
}

function updateFace(mood) {
  const mouth = document.getElementById("mouth");
  const eyes = document.querySelectorAll(".eye");

  if (mood === "HAPPY") {
    mouth.style.width = "45px";
    mouth.style.height = "16px";
  } else if (mood === "SAD") {
    mouth.style.width = "30px";
    mouth.style.height = "5px";
    mouth.style.transform = "rotate(180deg)";
  } else if (mood === "ANGRY") {
    mouth.style.width = "35px";
    mouth.style.height = "4px";
    mouth.style.transform = "rotate(0deg)";
  } else {
    mouth.style.width = "30px";
    mouth.style.height = "5px";
    mouth.style.transform = "none";
  }
}

function handlePacket(packet) {
  try {
    const data = JSON.parse(packet);

    if (data.type === "state") {
      updateFace(data.mood || "IDLE");
    }

    if (data.type === "reply") {
      updateFace(data.mood || "IDLE");
      showMessage(data.text || "");
    }

    if (data.type === "message") {
      showMessage(data.text || "", "user");
    }

    if (data.type === "hello") {
      status.textContent = "Athena connected";
    }
  } catch (e) {
    console.warn("Invalid Athena packet:", packet);
  }
}

async function readLoop() {
  const decoder = new TextDecoder();

  while (connected && reader) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let newline;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const packet = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (packet) handlePacket(packet);
    }
  }
}

connectButton.addEventListener("click", async () => {
  try {
    if (!("serial" in navigator)) {
      throw new Error("Use Chrome or Edge on a supported desktop.");
    }

    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });

    writer = port.writable.getWriter();
    reader = port.readable.getReader();
    connected = true;

    status.textContent = "Connected - requesting permission";
    connectButton.disabled = true;
    disconnectButton.disabled = false;

    await send({ type: "permission", granted: true });
    await send({ type: "hello", protocol: 1 });

    status.textContent = "Athena connected";
    showMessage("Our screens are connected!");

    readLoop().catch(error => {
      console.error(error);
      status.textContent = "USB read error";
    });

  } catch (error) {
    status.textContent = error.message;
  }
});

disconnectButton.addEventListener("click", async () => {
  connected = false;
  try {
    if (reader) {
      await reader.cancel();
      reader.releaseLock();
      reader = null;
    }
    if (writer) {
      writer.releaseLock();
      writer = null;
    }
    if (port) await port.close();
  } catch (error) {
    console.error(error);
  }

  status.textContent = "Disconnected";
  connectButton.disabled = false;
  disconnectButton.disabled = true;
});

document.getElementById("chatForm").addEventListener("submit", async e => {
  e.preventDefault();
  const input = document.getElementById("message");
  const text = input.value.trim();

  if (!text) return;
  if (!connected) {
    showMessage("Connect the handheld first.");
    return;
  }

  showMessage(text, "user");
  input.value = "";

  try {
    await send({ type: "user_message", text });
  } catch (error) {
    status.textContent = "USB send error";
  }
});
