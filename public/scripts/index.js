const width = window.innerWidth;

window.addEventListener('DOMContentLoaded', function () {
    const body = document.body;
    // Make visible with single animation
    document.documentElement.classList.add('ready');
    body.classList.add('initialized');

});



(function () {



    // Configuration
    const API_BASE_URL = "api/convert";

    // DOM Elements
    const uploadBtn = document.getElementById("uploadBatchBtn");
    const cancelBatchBtn = document.getElementById("cancelBatchBtn");
    const batchFileInput = document.getElementById("batchFile");
    const downloadTemplateBtn = document.getElementById("downloadTemplateBtn");
    const modal = document.getElementById("successModal");
    const closeModalBtn = document.getElementById("closeModalBtn");
    const errorModal = document.getElementById("errorModal");
    const closeErrorBtn = document.getElementById("closeErrorBtn");
    const successTitle = document.getElementById("successTitle");
    const successMessage = document.getElementById("successMessage");
    const successIcon = document.getElementById("successIcon");
    const uploadSummary = document.getElementById("uploadSummary");

    // Download Template
    downloadTemplateBtn.addEventListener("click", async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/template`, {
                method: "GET",
            });

            if (!response.ok) throw new Error("Failed to download template");

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "payment-adjustments_template.xlsx";
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Error downloading template:", error);
            showErrors("Failed to download template. Please try again.");
        }
    });

    // Cancel Button
    cancelBatchBtn.addEventListener("click", () => {
        batchFileInput.value = "";
    });

    // Upload File
    uploadBtn.addEventListener("click", async () => {
        const file = batchFileInput.files[0];

        if (!file) {
            showErrors("Please select a file to upload");
            return;
        }

        const formData = new FormData();
        formData.append("file", file);

        // Show loading
        showLoading();

        try {
            const response = await fetch(`${API_BASE_URL}/`, {
                method: "POST",
                body: formData,
            });

            const result = await response.json();

            if (!response.ok) {
                modal.classList.add("hidden");

                if (result.details && Array.isArray(result.details)) {
                    showErrors(result.details);
                } else {
                    throw new Error(result.error || "Upload failed");
                }
                return;
            }

            // Show success with summary
            showUploadSuccess(result);

            // Clear file input and hide form
            batchFileInput.value = "";
            console.log("gotten res");
            const byteCharacters = atob(result.file.data);
            console.log("gotten data");
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: result.file.mimetype });

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = result.file.filename;
            a.click();
        } catch (error) {
            console.error("Upload error:", error);
            modal.classList.add("hidden");
            showErrors(`Upload failed: ${error.message}`);
        }
    });
    function showLoading() {
        successIcon.innerHTML = `<div class="spinner"></div>`;
        successTitle.textContent = "Uploading...";
        successMessage.textContent = "Please wait while we process your file.";
        uploadSummary.classList.add("hidden");
        modal.classList.remove("hidden");
    }

    // Show Upload Success
    function showUploadSuccess(result) {
        const summary = result.summary;

        successIcon.innerHTML = `<svg class="svg" fill="none" stroke="currentColor" stroke-width="2"
      viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>`;

        successTitle.textContent = "Upload Complete";
        successMessage.textContent =
            result.message || "Batch upload completed successfully.";

        // Show summary
        document.getElementById("total-Records").textContent =
            summary.totalUniqueRecords || 0;
        document.getElementById("inactive").textContent = summary.inactive || 0;
        document.getElementById("successRecords").textContent =
            summary.uploaded || 0;
        document.getElementById("existingRecords").textContent =
            summary.existing || 0;
        document.getElementById("duplicateRows").textContent =
            summary.duplicates || 0;

        // Show failed pay classes if any
        if (summary.failed && Object.keys(summary.failed).length > 0) {
            const failedDiv = document.getElementById("failedPayclasses");
            const failedList = document.getElementById("failedList");

            let failedHtml = "";
            for (const [payclass, error] of Object.entries(summary.failed)) {
                failedHtml += `<p>• ${payclass}: ${error}</p>`;
            }

            failedList.innerHTML = failedHtml;
            failedDiv.classList.remove("hidden");
        }

        uploadSummary.classList.remove("hidden");
        modal.classList.remove("hidden");
    }

    // Show Errors
    function showErrors(errors) {
        const errorContent = document.getElementById("errorContent");

        let html = '<div class="error-list">';

        if (typeof errors === "string") {
            html += `
        <div class="error-item">
          <p class="error-item-message">${errors}</p>
        </div>`;
        } else if (Array.isArray(errors)) {
            errors.forEach((err, index) => {
                html += `
          <div class="error-item">
            <p class="error-item-title">Error ${index + 1}:</p>
            ${err.row ? `<p class="error-item-detail">Row: ${err.row}</p>` : ""}
            ${err.serviceNumber ? `<p class="error-item-detail">Service Number: ${err.serviceNumber}</p>` : ""}
            ${err.deductionType ? `<p class="error-item-detail">Deduction Type: ${err.deductionType}</p>` : ""}
            <p class="error-item-message">${err.error || err}</p>
          </div>`;
            });
        }

        html += "</div>";
        errorContent.innerHTML = html;
        errorModal.classList.remove("hidden");
    }

    // Close Modals
    closeModalBtn.addEventListener("click", () => {
        modal.classList.add("hidden");
    });

    closeErrorBtn.addEventListener("click", () => {
        errorModal.classList.add("hidden");
    });

    async function checkLiveness() {
        const dot = document.getElementById("liveDot");
        const text = document.getElementById("liveText");

        dot.className = "dot checking";
        text.textContent = "Checking...";

        try {
            const res = await fetch("/api/ready", {
                method: "GET",
                cache: "no-store"
            });

            if (res.ok) {
                dot.className = "dot online";
                text.textContent = "Live";
            } else {
                throw new Error();
            }
        } catch (err) {
            dot.className = "dot offline";
            text.textContent = "Unavailable";
        }
    }

    // Initial check
    checkLiveness();

    // Optional: check every 30 seconds
    setInterval(checkLiveness, 30000);
})();