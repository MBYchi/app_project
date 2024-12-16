document.addEventListener("DOMContentLoaded", async function () {
    const roomId = getRoomIdFromURL();
    const privateKeyString = sessionStorage.getItem("privateKey");

    if (!privateKeyString) {
        alert("Private key not found! Please upload your private key.");
        return;
    }

    try {
        // Import the user's private key
        const privateKey = await importPrivateKey(privateKeyString);

        // Fetch room's symmetric key (from sessionStorage or API if necessary)

        const encryptedKey = await getRoomKey(roomId);

        const symmetricKey = await decryptKey(encryptedKey, privateKey);
        // Fetch files in the room
        const response = await fetch(`/api/room/${roomId}/files/`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
        });

        if (!response.ok) {
            const error = await response.json();
            alert("Error fetching files: " + (error.message || response.statusText));
            return;
        }

        console.log(response);
        const { files } = await response.json();

        const fileListContainer = document.getElementById("file-list");

        if (!files || files.length === 0) {
            fileListContainer.innerHTML = "<p>No files in this room.</p>";
            return;
        }

        const decoder = new TextDecoder();

        for (const file of files) {
            try {
                // Decrypt the file name
                const decryptedName = await decryptAndDecode(file.encrypted_name, symmetricKey, decoder);

                // Display the file
                const listItem = document.createElement("li");
                listItem.className = "list-group-item";
                listItem.innerHTML = `
                    <strong>File Name:</strong> ${decryptedName} <br>
                    <strong>Hash:</strong> ${file.hash} <br>
                    <strong>Uploaded On:</strong> ${file.timestamp}
                `;
                fileListContainer.appendChild(listItem);
            } catch (error) {
                console.error("Error decrypting file:", error);
                const errorItem = document.createElement("li");
                errorItem.className = "list-group-item text-danger";
                errorItem.textContent = "Failed to decrypt file details.";
                fileListContainer.appendChild(errorItem);
            }
        }
    } catch (error) {
        console.error("Error loading files:", error);
        alert("An error occurred while loading files.");
    }
});

// Helper function: Decrypt the room's symmetric key
async function decryptKey(encryptedKeyBase64, privateKey) {
    console.log(encryptedKeyBase64);
    const encryptedKey = base64ToArrayBuffer(encryptedKeyBase64);
    return crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, encryptedKey);
}

function getRoomIdFromURL() {
    // Ensure the pathname has no trailing slash and split it
    const urlParts = window.location.pathname.replace(/\/$/, "").split("/");

    // Debugging log to verify the parts of the URL
    console.log("URL Parts:", urlParts);

    // Assuming the room ID is the second-to-last part of the URL
    return urlParts[urlParts.length - 1] || null;
}

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

function base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

async function getRoomKey(room_id) {
    try {
        // Send a GET request to the Django endpoint
        const response = await fetch(`/api/room/files/${room_id}/key/`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json"
            },
        });

        if (!response.ok) {
            // Handle HTTP errors
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
        }

        // Parse the JSON response
        const data = await response.json();

        // Log or return the `encrypted_key`
        console.log(typeof data.encrypted_key)
        console.log("Encrypted Key:", data.encrypted_key);
        return data.encrypted_key;
    } catch (error) {
        // Handle errors (e.g., network issues, server errors)
        console.error("Failed to fetch room key:", error);
        return null;
    }
}