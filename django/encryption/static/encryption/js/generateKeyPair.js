let isKeyGenerated = false;
async function generateKeyPair() {
    if (isKeyGenerated) {
        console.warn("Keys have already been generated.");
        return; // Не генерируем ключи повторно
    }

    isKeyGenerated = true; // Устанавливаем флаг

    const keyPair = await window.crypto.subtle.generateKey(
        {
            name: "RSA-OAEP",
            modulusLength: 2048,
            publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
            hash: "SHA-256",
        },
        true, // exportable keys
        ["encrypt", "decrypt"]
    );

    // Экспортируем публичный ключ в формат PEM
    const exportedPublicKey = await window.crypto.subtle.exportKey(
        "spki",
        keyPair.publicKey
    );
    const publicKeyPem = convertArrayBufferToPem(exportedPublicKey);

    // Экспортируем приватный ключ и сохраняем его в локальное хранилище
    const exportedPrivateKey = await window.crypto.subtle.exportKey(
        "pkcs8",
        keyPair.privateKey
    );
    const privateKeyPem = convertArrayBufferToPem(exportedPrivateKey);

    // Скачиваем приватный ключ
    downloadPrivateKey(privateKeyPem);

    sessionStorage.setItem("privateKey", privateKeyPem);
    // Сохраняем публичный ключ в sessionStorage
    sessionStorage.setItem("publicKey", publicKeyPem);
    return publicKeyPem;
}

function downloadPrivateKey(privateKeyPem) {
    const blob = new Blob([privateKeyPem], { type: "application/octet-stream" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "private_key.pem";
    link.click(); // Инициируем скачивание
    URL.revokeObjectURL(link.href); // Освобождаем объект URL
}



function convertArrayBufferToPem(buffer) {
    const binaryString = String.fromCharCode(...new Uint8Array(buffer));
    const base64String = btoa(binaryString);
    const pemString = `-----BEGIN KEY-----\n${base64String}\n-----END KEY-----`;
    return pemString;
}

// Генерируем ключи и сохраняем публичный в переменной
// generateKeyPair().then((publicKeyPem) => {
//      console.log("Public Key Generated and Saved:", publicKeyPem);
// });
