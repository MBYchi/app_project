async function uploadPublicKey() {
    const publicKey = sessionStorage.getItem("publicKey");

    if (!publicKey) {
        console.error("Public key not found in session storage.");
        return;
    }

    const csrfToken = document.querySelector("[name=csrfmiddlewaretoken]").value;

    try {
        const response = await fetch("/upload-public-key/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": csrfToken,
            },
            body: JSON.stringify({ public_key: publicKey }),
        });

        if (response.ok) {
            console.log("Public key uploaded successfully.");
        } else {
            const errorData = await response.json();
            console.error("Error uploading public key:", errorData);
        }
    } catch (error) {
        console.error("Error during upload:", error);
    }
}

