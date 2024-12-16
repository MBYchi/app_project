document.addEventListener("DOMContentLoaded", async function () {
    try {
        const roomId = getRoomIdFromURL();
        console.log("Extracted Room ID:", roomId);

        if (!roomId) {
            alert("Room ID not found in the URL.");
            return;
        }

        const roomResponse = await fetch(`/api/room/${roomId}/files/`);

        if (!roomResponse.ok) {
            throw new Error("Failed to fetch room files.");
        }

        const { files, message } = await roomResponse.json();

        // Handle case when no files are in the room
        const fileList = document.getElementById("file-list");
        fileList.innerHTML = "";  // Clear existing list

        if (message) {
            fileList.textContent = message;  // Display "No files in this room"
        } else {
            files.forEach(file => {
                const listItem = document.createElement("li");
                listItem.textContent = file.name;

                const downloadButton = document.createElement("button");
                downloadButton.textContent = "Download";
                downloadButton.className = "btn btn-primary";

                downloadButton.addEventListener("click", async () => {
                    const downloadResponse = await fetch(`/api/room/files/${file.id}/download/`);
                    const { download_url } = await downloadResponse.json();
                    window.location.href = download_url;
                });

                listItem.appendChild(downloadButton);
                fileList.appendChild(listItem);
            });
        }

    } catch (err) {
        console.error("Error loading room data:", err);
        alert("An error occurred while loading room data. Please try again.");
    }
});


// Function to extract Room ID from the URL
function getRoomIdFromURL() {
    // Ensure the pathname has no trailing slash and split it
    const urlParts = window.location.pathname.replace(/\/$/, "").split("/");

    // Debugging log to verify the parts of the URL
    console.log("URL Parts:", urlParts);

    // Assuming the room ID is the second-to-last part of the URL
    return urlParts[urlParts.length - 1] || null;
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

// Convert Base64 string to ArrayBuffer
function base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

// Example function for decrypting a file name (you may already have this implemented elsewhere)
async function decryptFileName(encryptedName, privateKey) {
    const encryptedBuffer = base64ToArrayBuffer(encryptedName);
    const decryptedBuffer = await crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        privateKey,
        encryptedBuffer
    );
    return new TextDecoder().decode(decryptedBuffer);
}
