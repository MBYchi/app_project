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
