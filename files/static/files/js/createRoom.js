document.getElementById("create-room-form").addEventListener("submit", async function (e) {
    e.preventDefault();

    const publicKeyString = localStorage.getItem("publicKey");
    const roomName = document.getElementById("room-name").value;
    const roomDescription = document.getElementById("room-description").value;

    if (!publicKeyString) {
        alert("Public key not found! Please ensure you are logged in.");
        return;
    }

    try {
        // Parse the public key
        const publicKey = JSON.parse(publicKeyString);

        // Generate a symmetric key
        const symmetricKey = crypto.getRandomValues(new Uint8Array(32));

        // Encrypt room name and description with symmetric key
        const encoder = new TextEncoder();
        const encryptedName = await encryptData(encoder.encode(roomName), symmetricKey);
        const encryptedDescription = await encryptData(encoder.encode(roomDescription), symmetricKey);

        // Encrypt the symmetric key with the user's public key
        const encryptedKey = await encryptSymmetricKey(symmetricKey, publicKey);

        // Prepare data to send to the server
        const data = {
            encrypted_name: arrayBufferToBase64(encryptedName),
            encrypted_description: arrayBufferToBase64(encryptedDescription),
            encrypted_key: arrayBufferToBase64(encryptedKey),
        };

        // Submit data to the server
        const response = await fetch("/api/create-room/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": getCsrfToken(),
            },
            body: JSON.stringify(data),
        });

        if (response.ok) {
            document.getElementById("status-message").style.display = "block";
            document.getElementById("status-message").textContent = "Room created successfully!";
        } else {
            const error = await response.json();
            alert("Failed to create room: " + error.message);
        }
    } catch (err) {
        console.error("Error creating room:", err);
        alert("An error occurred while creating the room.");
    }
});

// Helper functions
function getCsrfToken() {
    return document.querySelector('input[name="csrfmiddlewaretoken"]').value;
}

async function encryptData(data, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12)); // Random initialization vector
    const algorithm = { name: "AES-GCM", iv: iv };
    const cryptoKey = await crypto.subtle.importKey("raw", key, algorithm, false, ["encrypt"]);
    const encrypted = await crypto.subtle.encrypt(algorithm, cryptoKey, data);
    return combineBuffer(iv, encrypted);
}

async function encryptSymmetricKey(key, publicKey) {
    const importedKey = await crypto.subtle.importKey(
        "jwk",
        publicKey,
        { name: "RSA-OAEP", hash: "SHA-256" },
        false,
        ["encrypt"]
    );
    return crypto.subtle.encrypt({ name: "RSA-OAEP" }, importedKey, key);
}

function combineBuffer(iv, data) {
    const combined = new Uint8Array(iv.byteLength + data.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(data), iv.byteLength);
    return combined.buffer;
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach(b => binary += String.fromCharCode(b));
    return window.btoa(binary);
}
