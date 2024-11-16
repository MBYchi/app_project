document.addEventListener('DOMContentLoaded', () => {
    // Getting the elements of the form
    const fileInput = document.getElementById('file');
    const uploadButton = document.getElementById('uploadButton');
    const csrfToken = document.getElementById('csrfToken').value;

    // Button click handler
    uploadButton.addEventListener('click', () => {
        if (!fileInput.files.length) {
            alert("Please select a file.");
            return;
        }

        const file = fileInput.files[0];
        const reader = new FileReader();

        // File reading and encryption
        reader.onload = function(event) {
            const fileContent = event.target.result;

            // Generating the encryption key
            const key = CryptoJS.enc.Utf8.parse('1234567890123456'); // Replace it with a secure key
            const encrypted = CryptoJS.AES.encrypt(fileContent, key, {
                mode: CryptoJS.mode.ECB,
                padding: CryptoJS.pad.Pkcs7
            });

            // Creating a Blob with encrypted content
            const encryptedBlob = new Blob([encrypted.toString()], { type: 'text/plain' });

            // Preparing data for sending
            const formData = new FormData();
            formData.append('file', encryptedBlob, file.name + '.enc');

            // Sending a file to the server
            fetch('/upload/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': csrfToken // CSRF Token Transfer
                },
                body: formData
            })
            .then(response => {
                if (response.ok) {
                    alert('Encrypted file uploaded successfully');
                } else {
                    alert('Failed to upload file');
                }
            })
            .catch(error => {
                console.error('Error uploading file:', error);
                alert('An error occurred during upload.');
            });
        };

        reader.readAsText(file); // Reading a file as text
    });
});
