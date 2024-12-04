document.getElementById("create-room-form").addEventListener("submit", async function (e) {
    e.preventDefault();

    const roomName = document.getElementById("room-name").value;
    const roomDescription = document.getElementById("room-description").value;

    try {
        // Fetch public key
        const publicKeyPem = await importPublicKey();
        const publicKey = await importPublicKey(publicKeyPem);

        // Generate symmetric key
        const roomKey = await crypto.subtle.generateKey(
            { name: "AES-CBC", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );

        // Encrypt room name and description
        const encryptedName = await encryptData(roomName, roomKey);
        const encryptedDescription = await encryptData(roomDescription, roomKey);

        // Encrypt room key with user's public key
        const exportedRoomKey = await crypto.subtle.exportKey("raw", roomKey);
        const encryptedRoomKey = await crypto.subtle.encrypt(
            { name: "RSA-OAEP" },
            publicKey,
            exportedRoomKey
        );

        // Prepare data for server
        const payload = {
            encrypted_name: Array.from(new Uint8Array(encryptedName.encrypted)),
            encrypted_description: Array.from(new Uint8Array(encryptedDescription.encrypted)),
            iv: Array.from(new Uint8Array(encryptedName.iv)),
            encrypted_key: Array.from(new Uint8Array(encryptedRoomKey)),
        };

        // Send data to server
        const response = await fetch("/api/create-room/", {
            method: "POST",
            body: JSON.stringify(payload),
            headers: { "Content-Type": "application/json", "X-CSRFToken": getCookie('csrftoken') },
        });

        if (response.ok) {
            document.getElementById("status-message").style.display = "block";
            document.getElementById("status-message").textContent = "Room created successfully!";
        } else {
            throw new Error("Failed to create room");
        }
    } catch (error) {
        document.getElementById("status-message").style.display = "block";
        document.getElementById("status-message").textContent = "Error: " + error.message;
    }
});

async function encryptData(data, key) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const iv = crypto.getRandomValues(new Uint8Array(16));

    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-CBC", iv },
        key,
        dataBuffer
    );

    return { encrypted, iv };
}

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(";").shift();
}
