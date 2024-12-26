document.addEventListener("DOMContentLoaded", async function () {
    const contextScript = document.getElementById("context-data");
    const contextData = JSON.parse(contextScript.textContent);
    console.log(contextData.shared_users);
    const roomId = Number(contextData.roomId);
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
        const decoder = new TextDecoder();
        const room_name_header = document.getElementById('room-name');
        const decrypted_room_name = await decryptAndDecode(contextData.encryptedName, symmetricKey, decoder);
        room_name_header.innerText = decrypted_room_name;
        const desc_room_p = document.getElementById('room-description');
        const decrypted_description = await decryptAndDecode(contextData.encryptedDescription, symmetricKey, decoder);
        desc_room_p.innerText = decrypted_description;

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
                    <button class="btn btn-primary btn-sm download-btn" data-file-id="${file.hash}">
                        Download
                    </button>
                    <button class="btn btn-danger btn-sm delete-btn" data-file-id="${file.hash}">
                        Delete
                    </button>
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

        if (contextData.priviledges == "admin") {
            const sharedUsers = contextData.shared_users;
            const sharedUsersContainer = document.getElementById("shared-users-section");
            const sharedUsersSection = document.createElement("div");
            sharedUsersContainer.id = "shared-users-section";
            sharedUsersSection.innerHTML = "<h3>Shared Users</h3>";

            if (!sharedUsers || sharedUsers.length === 0) {
                sharedUsersSection.innerHTML += "<p>No users have access to this room.</p>";
            } else {
                const sharedUsersList = document.createElement("ul");
                sharedUsersList.className = "list-group";

                sharedUsers.forEach(user => {
                    const listItem = document.createElement("li");
                    listItem.className = "list-group-item";
                    listItem.innerHTML = `
                    <strong>Username:</strong> ${user.user_profile__username} <br>
                    <strong>Privilege:</strong> ${user.privileges}
                    <button class="btn btn-danger btn-sm remove-user-btn" data-username="${user.user_profile__username}">
                        Remove access for user
                    </button>
                `;
                    sharedUsersList.appendChild(listItem);
                });

                sharedUsersSection.appendChild(sharedUsersList);
            }

            sharedUsersContainer.appendChild(sharedUsersSection);
        }

        // Add event listener for download buttons
        document.addEventListener("click", async function (event) {
            if (event.target.classList.contains("download-btn")) {
                const hash = event.target.getAttribute("data-file-id");
                await downloadFile(hash, symmetricKey);
            }});

        document.addEventListener("click", async function (event){
            if (event.target.classList.contains("remove-user-btn")) {
                const username = event.target.getAttribute("data-username")
                if (confirm("Are you sure you want to remove access for this user?")) {
                await remove_user(roomId, username);
                }
            }
        })
        // Set up file upload handling
        const uploadForm = document.getElementById("upload-file-form");
        uploadForm.addEventListener("submit", (event) => handleFileUpload(event, symmetricKey, roomId));

    } catch (error) {
        console.error("Error initializing the page:", error);
        alert("An error occurred during initialization.");
    }
});

document.getElementById("share-room-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const roomId = getRoomIdFromURL();
    const targetUsername = document.getElementById("target-username").value.trim();
    const privilege = document.getElementById("privilege").value;

    if (!targetUsername || !privilege) {
        alert("Please provide all required details.");
        return;
    }

    await shareRoomWithUser(roomId, targetUsername, privilege);
});

// Download and decrypt file
async function downloadFile(hash, symmetricKey) {
    try {
        // Fetch presigned URL
        const response = await fetch(`/api/room/files/${hash}/download/`, {
            method: "GET",
            headers: {
                "X-CSRFToken": getCSRFToken(), // Include the CSRF token
            },
            headers: { "Content-Type": "application/json" },
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || response.statusText);
        }

        const { download_url, encrypted_name } = await response.json();

        // Fetch the encrypted file
        const encryptedFileResponse = await fetch(download_url);
        if (!encryptedFileResponse.ok) {
            throw new Error("Failed to download the encrypted file.");
        }

        const encryptedFileBuffer = await encryptedFileResponse.arrayBuffer();

        // Decrypt the file
        const decryptedFileBuffer = await decryptData(encryptedFileBuffer, symmetricKey);

        // Convert decrypted buffer to a Blob for download
        const blob = new Blob([decryptedFileBuffer]);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);

        // Use decrypted file name for the download
        const decryptedFileName = await decryptAndDecode(encrypted_name, symmetricKey, new TextDecoder());
        a.download = decryptedFileName;

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        alert("File downloaded successfully!");
    } catch (error) {
        console.error("Error downloading and decrypting file:", error);
        alert("Failed to download and decrypt the file.");
    }
}

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
        location.reload(true);
    } catch (error) {
        console.error("Error uploading file:", error);
        alert("Failed to upload the file.");
    }
}

document.addEventListener("click", async function (event) {
    if (event.target.classList.contains("delete-btn")) {
        const hash = event.target.getAttribute("data-file-id");
        if (confirm("Are you sure you want to delete this file?")) {
            await deleteFile(hash);
        }
    }
});

async function deleteFile(hash) {
    try {
        const response = await fetch(`/api/room/files/${hash}/delete/`, {
            method: "DELETE",
            headers: {
                "X-CSRFToken": getCSRFToken(), // Include the CSRF token
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || response.statusText);
        }

        alert("File deleted successfully!");
        location.reload(true);
    } catch (error) {
        console.error("Error deleting file:", error);
        alert("Failed to delete the file.");
    }
}

async function shareRoomWithUser(roomId, targetUsername, privilege) {
    try {
        // Fetch admin's private key from session storage
        const privateKeyString = sessionStorage.getItem("privateKey");
        if (!privateKeyString) {
            throw new Error("Admin's private key not found in session storage.");
        }

        const privateKey = await importPrivateKey(privateKeyString);

        // Fetch admin's encrypted key for the room
        const accessResponse = await fetch(`/api/room/files/${roomId}/key/`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
        });

        if (!accessResponse.ok) {
            const accessError = await accessResponse.json();
            throw new Error(accessError.message || "Failed to fetch admin's encrypted room key.");
        }

        const { encrypted_key: adminEncryptedKey } = await accessResponse.json();

        // Decrypt the symmetric key
        const symmetricKey = await decryptKey(adminEncryptedKey, privateKey);

        // Fetch the public key of the target user
        const userResponse = await fetch(`/api/user/${targetUsername}/public_key/`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
        });

        if (!userResponse.ok) {
            const userError = await userResponse.json();
            throw new Error(userError.message || "Failed to fetch the user's public key.");
        }

        const { public_key: targetUserPublicKeyPEM } = await userResponse.json();
        console.log(targetUserPublicKeyPEM);
        const targetUserPublicKey = await importPublicKey(targetUserPublicKeyPEM);

        // Encrypt the symmetric key with the target user's public key
        const encryptedKeyForTargetUser = await crypto.subtle.encrypt(
            { name: "RSA-OAEP" },
            targetUserPublicKey,
            symmetricKey
        );

        // Share the encrypted key with the backend
        const shareResponse = await fetch(`/api/room/${roomId}/share/`, {
            method: "POST",
            headers: {
                "X-CSRFToken": getCSRFToken(),
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                username: targetUsername,
                encrypted_key: arrayBufferToBase64(encryptedKeyForTargetUser),
                privileges: privilege, // Send the selected privilege
            }),
        });

        if (!shareResponse.ok) {
            const shareError = await shareResponse.json();
            throw new Error(shareError.message || "Failed to share the room.");
        }

        alert("Room shared successfully.");
    } catch (error) {
        console.error("Error sharing the room:", error);
        alert(error.message || "An error occurred while sharing the room.");
    }
}

async function remove_user(roomId, username){
    try  {
        const response = await fetch(`/api/room/${roomId}/shared-users/${username}/`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json",
            "X-CSRFToken": getCSRFToken(),
            },
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || response.statusText);
        }

        alert(`User ${username} has been removed successfully.`);
        location.reload(); // Reload to refresh the shared users list
    } catch (error)  {
        console.error("Error removing shared user:", error);
        alert(`Failed to remove user ${username}: ${error.message}`);
    }
}

async function importPublicKey(pemKey) {
    console.log(pemKey);
    const pemHeader = "-----BEGIN KEY-----";
    const pemFooter = "-----END KEY-----";
    const pemContents = pemKey.replace(pemHeader, "").replace(pemFooter, "").replace(/\s+/g, "");
    console.log(pemContents);
    const binaryDer = Uint8Array.from(window.atob(pemContents), c => c.charCodeAt(0));

    return crypto.subtle.importKey(
        "spki",
        binaryDer,
        { name: "RSA-OAEP", hash: "SHA-256" },
        true,
        ["encrypt"]
    );
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