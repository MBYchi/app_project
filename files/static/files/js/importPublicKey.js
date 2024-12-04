async function importPublicKey(pem) {
    const binaryDer = convertPemToBinary(pem);
    return await crypto.subtle.importKey(
        "spki",
        binaryDer,
        { name: "RSA-OAEP", hash: "SHA-256" },
        true,
        ["encrypt"]
    );
}

function convertPemToBinary(pem) {
    const base64 = pem
        .replace(/-----BEGIN PUBLIC KEY-----/, "")
        .replace(/-----END PUBLIC KEY-----/, "")
        .replace(/\n/g, "");
    return Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer;
}