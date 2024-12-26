document.getElementById("create-room-form").addEventListener("submit", async function (e) {
    e.preventDefault();

    let publicKeyPem = sessionStorage.getItem("publicKey");
    const roomName = document.getElementById("room-name").value;
    const roomDescription = document.getElementById("room-description").value;

    try {
        if (!publicKeyPem) {
            // Fetch public key from server
            publicKeyPem = await fetchPublicKeyFromServer();
            if (!publicKeyPem) {
                alert("Failed to retrieve public key. Please ensure you are logged in.");
                return;
            }
            sessionStorage.setItem("publicKey", publicKeyPem);
        }

        // Parse the public key PEM to CryptoKey
        const publicKey = await pemToCryptoKey(publicKeyPem);

        // Generate a symmetric key
        const symmetricKey = crypto.getRandomValues(new Uint8Array(32));

        // Encrypt room name and description with symmetric key
        const encryptedName = await encryptAndEncode(roomName, symmetricKey);
        const encryptedDescription = await encryptAndEncode(roomDescription, symmetricKey);

        // Encrypt the symmetric key with the user's public key
        const encryptedKey = await encryptSymmetricKey(symmetricKey, publicKey);

        // Prepare data to send to the server
        const data = {
            encrypted_name: encryptedName,
            encrypted_description: encryptedDescription,
            encrypted_key: encryptedKey,
        };

        // Submit data to the server
        const response = await fetch("/api/create-room/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": getCSRFToken(),
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

// Fetch the public key from the server
async function fetchPublicKeyFromServer() {
    try {
        const response = await fetch("/api/get-public-key/");
        if (response.ok) {
            const data = await response.json();
            return data.public_key; // Assuming the server returns the key as { "public_key": "<PEM>" }
        } else {
            console.error("Failed to fetch public key:", response.statusText);
            return null;
        }
    } catch (error) {
        console.error("Error fetching public key:", error);
        return null;
    }
}

async function pemToCryptoKey(pem) {
    const pemHeader = "-----BEGIN KEY-----";
    const pemFooter = "-----END KEY-----";
    const pemContents = pem
        .replace(pemHeader, "")
        .replace(pemFooter, "")
        .replace(/\s/g, ""); // Remove line breaks and spaces

    const binaryDer = Uint8Array.from(window.atob(pemContents), c => c.charCodeAt(0));

    return await crypto.subtle.importKey(
        "spki", // SubjectPublicKeyInfo format
        binaryDer.buffer,
        { name: "RSA-OAEP", hash: "SHA-256" },
        false,
        ["encrypt"]
    );
}

async function encryptSymmetricKey(key, publicKey) {
    return base64ToArrayBuffer(crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, key));
}