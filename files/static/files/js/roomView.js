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

        // Fetch room's symmetric key
        const encryptedKey = await getRoomKey(roomId);
        const rawSymmetricKey = await decryptKey(encryptedKey, privateKey);
        // Import the symmetric key for encryption
        const symmetricKey = await crypto.subtle.importKey(
            "raw",
            rawSymmetricKey,
            { name: "AES-GCM" },
            false,
            ["encrypt", "decrypt"]
        );
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

        const { files } = await response.json();

        const fileListContainer = document.getElementById("file-list");

        if (!files || files.length === 0) {
            fileListContainer.innerHTML = "<p>No files in this room.</p>";
        } else {
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
        }
        // Set up file upload handling
        const uploadForm = document.getElementById("upload-file-form");
        uploadForm.addEventListener("submit", (event) => handleFileUpload(event, symmetricKey, roomId));

    } catch (error) {
        console.error("Error initializing the page:", error);
        alert("An error occurred during initialization.");
    }
});

async function handleFileUpload(event, symmetricKey, roomId) {
    event.preventDefault();
    const fileInput = document.getElementById("file-input");
    if (!fileInput.files || fileInput.files.length === 0) {
        alert("Please select a file to upload.");
        return;
    }

    const file = fileInput.files[0];
    const fileName = file.name;

    try {
        // Encrypt the file and the file name
        const encryptedFileName = await encryptAndEncode(fileName, symmetricKey);
        const encryptedFile = await encryptFile(file, symmetricKey);

        // Retrieve the CSRF token
        const csrfToken = getCSRFToken();

        // Create a FormData object to send the encrypted file
        const formData = new FormData();
        formData.append("file", new Blob([encryptedFile]), "encrypted_file");
        formData.append("file_name", encryptedFileName);

        // Upload the file with CSRF token
        const response = await fetch(`/api/room/${roomId}/upload/`, {
            method: "POST",
            headers: {
                "X-CSRFToken": csrfToken, // Include the CSRF token
            },
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || response.statusText);
        }

        alert("File uploaded successfully!");
    } catch (error) {
        console.error("Error uploading file:", error);
        alert("Failed to upload the file.");
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


async function encryptAndEncode(plaintext, symmetricKey) {
    const encoder = new TextEncoder();
    const encodedText = encoder.encode(plaintext);

    // Generate a random initialization vector (IV)
    const iv = crypto.getRandomValues(new Uint8Array(12)); // AES-GCM standard IV size is 12 bytes

    const ciphertext = await crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv,
        },
        symmetricKey,
        encodedText
    );

    // Concatenate IV and ciphertext, and encode in base64
    const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.byteLength);

    return arrayBufferToBase64(combined);
}

async function encryptFile(file, symmetricKey) {
    const fileBuffer = await file.arrayBuffer();

    // Generate a random IV for the file
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const ciphertext = await crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv,
        },
        symmetricKey,
        fileBuffer
    );

    // Concatenate IV and ciphertext
    const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.byteLength);

    return combined;
}

function arrayBufferToBase64(buffer) {
    const binary = String.fromCharCode(...new Uint8Array(buffer));
    return btoa(binary);
}


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

async function decryptAndDecode(encryptedBase64, aesKey, decoder) {
    const encryptedData = base64ToArrayBuffer(encryptedBase64);
    const decryptedData = await decryptData(encryptedData, aesKey);
    return decoder.decode(decryptedData);
}

async function decryptData(data, key) {
    const iv = data.slice(0, 12); // Extract the IV (first 12 bytes)
    const encryptedData = data.slice(12); // Rest is the ciphertext
    return crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        key,
        encryptedData
    );
}