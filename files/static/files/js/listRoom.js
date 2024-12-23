document.addEventListener("DOMContentLoaded", async function () {
    const privateKeyString = sessionStorage.getItem("privateKey");

    if (!privateKeyString) {
        alert("Private key not found! Please make sure that you have uploaded your private key in this session.");
        return;
    }

    try {
        // Import the private key from PEM format
        const privateKey = await importPrivateKey(privateKeyString);

        // Fetch the list of rooms from the server
        const response = await fetch("/api/list-rooms/", {
            method: "GET",
            headers: { "Content-Type": "application/json" },
        });

        if (!response.ok) {
            const error = await response.json();
            alert("Failed to fetch rooms: " + (error.message || response.statusText));
            return;
        }

        const { rooms } = await response.json(); // Expecting an array of room objects
        const roomListContainer = document.getElementById("room-list");
        roomListContainer.innerHTML = ""; // Clear existing content

        const decoder = new TextDecoder();

        for (const room of rooms) {
            try {
                console.log(room.encrypted_key);
                console.log(typeof room.encrypted_key);
                // Decrypt the symmetric key using the private key
                const encryptedKey = base64ToArrayBuffer(room.encrypted_key);
                const symmetricKey = await crypto.subtle.decrypt(
                    { name: "RSA-OAEP" },
                    privateKey,
                    encryptedKey
                );

                // Import the symmetric key for AES decryption
                const aesKey = await crypto.subtle.importKey(
                    "raw",
                    symmetricKey,
                    { name: "AES-GCM" },
                    false,
                    ["decrypt"]
                );

                // Decrypt room name and description
                const roomName = await decryptAndDecode(room.encrypted_name, aesKey, decoder);
                const roomDescription = await decryptAndDecode(room.encrypted_description, aesKey, decoder);

                // Add room to the list
                const listItem = document.createElement("li");
                listItem.className = "list-group-item";
                listItem.innerHTML = `
                    <strong>Room Name:</strong> <span class="room-name">${roomName}</span> <br>
                    <strong>Description:</strong> <span class="room-description">${roomDescription}</span> <br>
                    <button class="btn btn-primary enter-room" data-room-id="${room.room_id}">
                        Enter Room
                    </button>
                    <button class="btn btn-danger delete-room" data-room-id="${room.room_id}">
                        Delete Room
                    </button>
                `;
                roomListContainer.appendChild(listItem);

                // Attach event listener to the button
                const enterRoomButton = listItem.querySelector(".enter-room");
                enterRoomButton.addEventListener("click", () => {
                    handleEnterRoom(room.room_id);
                });

                const deleteRoomButton = listItem.querySelector(".delete-room");
                deleteRoomButton.addEventListener("click", async () => {
                    if (confirm("Are you sure you want to delete this room? This action cannot be undone.")) {
                        await handleDeleteRoom(room.room_id);
                    }
                });
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

// Handle entering a room
function handleEnterRoom(roomId) {
    // Redirect to the room's page, e.g., /room/{room_id}/
    window.location.href = `/room/${roomId}/`;
}

async function handleDeleteRoom(roomId) {
    try {
        const response = await fetch(`/api/delete-room/${roomId}/`, {
            method: "DELETE",
            headers: { "X-CSRFToken": getCSRFToken() },
        });

        if (response.ok) {
            alert("Room deleted successfully!");
            document.location.reload(); // Reload the page to refresh the list
        } else {
            const error = await response.json();
            alert("Failed to delete room: " + (error.message || response.statusText));
        }
    } catch (err) {
        console.error("Error deleting room:", err);
        alert("An error occurred while deleting the room.");
    }
}

// Function to get CSRF token from cookies
function getCSRFToken() {
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'csrftoken') {
            return value;
        }
    }
    return '';
}

// Helper function to import the private key from PEM format
async function importPrivateKey(pemKey) {
    const pemHeader = "-----BEGIN KEY-----";
    const pemFooter = "-----END KEY-----";
    const pemContents = pemKey.replace(pemHeader, "").replace(pemFooter, "").replace(/\s+/g, "");
    const binaryDer = base64ToArrayBuffer(pemContents);

    return crypto.subtle.importKey(
        "pkcs8",
        binaryDer,
        { name: "RSA-OAEP", hash: "SHA-256" },
        false,
        ["decrypt"]
    );
}

// Helper function to decrypt and decode data
async function decryptAndDecode(encryptedBase64, aesKey, decoder) {
    const encryptedData = base64ToArrayBuffer(encryptedBase64);
    const decryptedData = await decryptData(encryptedData, aesKey);
    return decoder.decode(decryptedData);
}

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
