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

function arrayBufferToBase64(buffer) {
    const binary = String.fromCharCode(...new Uint8Array(buffer));
    return btoa(binary);
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