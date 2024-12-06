document.addEventListener("DOMContentLoaded", async function () {
    const privateKeyString = localStorage.getItem("privateKey");

    if (!privateKeyString) {
        alert("Private key not found! Please ensure you are logged in.");
        return;
    }

    try {
        // Parse and import the private key
        const privateKeyJWK = JSON.parse(privateKeyString);
        const privateKey = await crypto.subtle.importKey(
            "jwk",
            privateKeyJWK,
            { name: "RSA-OAEP", hash: "SHA-256" },
            false,
            ["decrypt"]
        );

        // Fetch the list of rooms from the server
        const response = await fetch("/api/list-rooms/", {
            method: "GET",
            headers: { "Content-Type": "application/json" },
        });

        if (!response.ok) {
            const error = await response.json();
            alert("Failed to fetch rooms: " + error.message);
            return;
        }

        const { rooms } = await response.json(); // Expecting an array of room objects
        const roomListContainer = document.getElementById("room-list");
        roomListContainer.innerHTML = ""; // Clear existing content

        const decoder = new TextDecoder();

        for (const room of rooms) {
            try {
                // Decrypt the symmetric key using the private key
                const encryptedKey = base64ToArrayBuffer(room.encrypted_key);
                const symmetricKey = await crypto.subtle.decrypt(
                    { name: "RSA-OAEP" },
                    privateKey,
                    encryptedKey
                );

                // Import the symmetric key
                const aesKey = await crypto.subtle.importKey(
                    "raw",
                    symmetricKey,
                    { name: "AES-GCM" },
                    false,
                    ["decrypt"]
                );

                // Decrypt room name
                const encryptedName = base64ToArrayBuffer(room.encrypted_name);
                const roomName = decoder.decode(await decryptData(encryptedName, aesKey));

                // Decrypt room description
                const encryptedDescription = base64ToArrayBuffer(room.encrypted_description);
                const roomDescription = decoder.decode(await decryptData(encryptedDescription, aesKey));

                // Add room to the list with a future action button
                const listItem = document.createElement("li");
                listItem.className = "list-group-item";
                listItem.innerHTML = `
                    <strong>Room Name:</strong> <span class="room-name">${roomName}</span> <br>
                    <strong>Description:</strong> <span class="room-description">${roomDescription}</span> <br>
                    <button class="btn btn-primary enter-room" data-room-id="${room.room_id}">
                        Enter Room
                    </button>
                `;
                roomListContainer.appendChild(listItem);
            } catch (error) {
                console.error("Failed to decrypt room:", error);
                const errorItem = document.createElement("li");
                errorItem.className = "list-group-item text-danger";
                errorItem.textContent = "Failed to decrypt room details.";
                roomListContainer.appendChild(errorItem);
            }
        }
    } catch (err) {
        console.error("Error fetching or decrypting rooms:", err);
        alert("An error occurred while loading rooms.");
    }
});

// Helper function for decryption
async function decryptData(data, key) {
    const iv = data.slice(0, 12); // Extract the IV (first 12 bytes)
    const encryptedData = data.slice(12); // Rest is the ciphertext
    return crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        key,
        encryptedData
    );
}

// Convert Base64 string to ArrayBuffer
function base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}