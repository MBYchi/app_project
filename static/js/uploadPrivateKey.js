document.getElementById("upload-pem-key").addEventListener("click", async () => {
    const fileInput = document.getElementById("pem-key-input");
    const statusMessage = document.getElementById("key-status");

    if (!fileInput.files.length) {
        statusMessage.textContent = "Please select a .pem file to upload.";
        statusMessage.classList.add("text-danger");
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = function (event) {
        const pemKey = event.target.result;

        // Check if the file has PEM formatting
        // if (!pemKey.includes("-----BEGIN PRIVATE KEY-----")) {
        //     statusMessage.textContent = "Invalid PEM file format.";
        //     statusMessage.classList.add("text-danger");
        //     return;
        // }

        // Save the key to session storage
        sessionStorage.setItem("privateKey", pemKey);

        statusMessage.textContent = "Private key uploaded successfully!";
        statusMessage.classList.remove("text-danger");
        statusMessage.classList.add("text-success");
    };

    reader.readAsText(file);
});
