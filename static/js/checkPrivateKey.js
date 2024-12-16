document.addEventListener("DOMContentLoaded", () => {
    const statusMessage = document.getElementById("key-status");
    if (sessionStorage.getItem("privateKey")) {
        statusMessage.textContent = "A private key is already loaded in your session.";
        statusMessage.classList.add("text-success");
    }
});
